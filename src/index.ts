import express from "express";
import axios from "axios";

const app = express();
const port = 3000;

enum IpLookupStatus {
  success = "success",
  fail = "fail",
}

interface GeoIpLookupCache {
  [key: string]: {
    status: IpLookupStatus;
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    zip: string;
    lat: number;
    lon: number;
    timezone: string;
    isp: string;
    org: string;
    as: string;
    query: string;
    cacheExpireAt: Date;
  };
}

interface WeatherLookupCache {
  [key: string]: {
    latitude: number;
    longitude: number;
    generationtime_ms: number;
    utc_offset_seconds: number;
    timezone: string;
    timezone_abbreviation: string;
    elevation: number;
    current_weather: {
      temperature: number;
      windspeed: number;
      winddirection: number;
      weathercode: number;
      is_day: number;
      time: string;
    };
    cacheExpireAt: Date;
  };
}

interface ApiResponse {
  success: boolean;
  error?: string;
  data?: {
    country: string;
    country_code: string;
    region: string;
    region_name: string;
    city: string;
    timezone: string;
    current_weather: {
      temperature: number;
      wind_speed: number;
      wind_direction: number;
      weather_code: number;
      is_day: boolean;
      time: string;
    };
  };
}

const geoIpCacheTime = 1000 * 60 * 60 * 24; // 24 hours
const weatherCacheTime = 1000 * 60 * 15; // 15 minutes
const geoIpLookupCache: GeoIpLookupCache = {};
const weatherLookupCache: WeatherLookupCache = {};

const isReservedIpRange = (ipAddress: string) => {
  // Check for IPv4
  const ipv4Pattern =
    /^(10\..*|172\.(1[6-9]|2[0-9]|3[0-1])\..*|192\.168\..*|127\..*|169\.254\..*|192\.88\.99\..*)$/;
  if (ipv4Pattern.test(ipAddress)) {
    return true;
  }

  // Check for IPv6
  const ipv6LocalPattern =
    /^fe[89ab][0-9a-fA-F]:.*|^::1$|^fc[0-9a-fA-F]{2}:.*$/;
  if (ipv6LocalPattern.test(ipAddress.toLowerCase())) {
    return true;
  }

  return false;
};

const getGeoIp = async (ip: string) => {
  const response = await axios.get(`http://ip-api.com/json/${ip}`);
  let data = response.data;

  data.cacheExpireAt = new Date(Date.now() + geoIpCacheTime);
  geoIpLookupCache[ip] = data;

  return data;
};

const getWeather = async (lat: number, lon: number) => {
  const response = await axios.get(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
  );
  let data = response.data;

  data.cacheExpireAt = new Date(Date.now() + weatherCacheTime);
  weatherLookupCache[`${lat},${lon}`] = data;

  return data;
};

const sendResponse = (res: any, data: ApiResponse) => {
  res.json(data);
};

app.get("/", async (req, res) => {
  // Get the user's IP address
  let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip?.toString().split(",")[0];

  if (!ip) return res.status(500).send("Error fetching location data");

  // Check if the IP address is in a reserved range, assume Japan IP if so (Linode IP address)
  if (isReservedIpRange(ip)) {
    ip = "139.162.65.37";
  }

  // Check if geo IP is cached
  let geoIp = geoIpLookupCache[ip];
  if (geoIp) {
    // Check if cached response is expired
    if (geoIp.cacheExpireAt < new Date()) {
      delete geoIpLookupCache[ip];
    }
  } else {
    console.log("Fetching GeoIP fresh response");
    try {
      geoIp = await getGeoIp(ip);
    } catch (e) {
      return res
        .status(500)
        .json({ success: false, error: "Error fetching location data" });
    }
  }

  // Check if weather is cached
  let weather = weatherLookupCache[`${geoIp.lat},${geoIp.lon}`];
  if (weather) {
    // Check if cached response is expired
    if (weather.cacheExpireAt < new Date()) {
      delete weatherLookupCache[`${geoIp.lat},${geoIp.lon}`];
    }
  } else {
    console.log("Fetching weather fresh response");
    try {
      weather = await getWeather(geoIp.lat, geoIp.lon);
    } catch (e) {
      return res
        .status(500)
        .json({ success: false, error: "Error fetching weather data" });
    }
  }

  return sendResponse(res, {
    success: true,
    data: {
      country: geoIp.country,
      country_code: geoIp.countryCode,
      region: geoIp.region,
      region_name: geoIp.regionName,
      city: geoIp.city,
      timezone: geoIp.timezone,
      current_weather: {
        temperature: weather.current_weather.temperature,
        wind_speed: weather.current_weather.windspeed,
        wind_direction: weather.current_weather.winddirection,
        weather_code: weather.current_weather.weathercode,
        is_day: weather.current_weather.is_day === 1 ? true : false,
        time: weather.current_weather.time,
      },
    },
  });
});

app.listen(port, () => {
  console.log(`Server running at port: ${port}`);
});
