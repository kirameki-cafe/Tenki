import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
  .use(cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }));

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


const geoIpCacheTime = 1000 * 60 * 60 * 24;
const weatherCacheTime = 1000 * 60 * 15;
const geoIpLookupCache: GeoIpLookupCache = {};
const weatherLookupCache: WeatherLookupCache = {};

const isReservedIpRange = (ipAddress: string) => {
  const ipv4Pattern =
    /^(10\..*|172\.(1[6-9]|2[0-9]|3[0-1])\..*|192\.168\..*|127\..*|169\.254\..*|192\.88\.99\..*)$/;
  if (ipv4Pattern.test(ipAddress)) {
    return true;
  }

  const ipv6LocalPattern =
    /^fe[89ab][0-9a-fA-F]:.*|^::1$|^fc[0-9a-fA-F]{2}:.*$/;
  if (ipv6LocalPattern.test(ipAddress.toLowerCase())) {
    return true;
  }

  return false;
};

const getGeoIp = async (ip: string) => {
  const response = await fetch(`http://ip-api.com/json/${ip}`);
  let data = await response.json();

  data.cacheExpireAt = new Date(Date.now() + geoIpCacheTime);
  geoIpLookupCache[ip] = data;

  return data;
};

const getWeather = async (lat: number, lon: number) => {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
  );
  let data = await response.json();

  data.cacheExpireAt = new Date(Date.now() + weatherCacheTime);
  weatherLookupCache[`${lat},${lon}`] = data;

  return data;
};


app.get("/", async ({ server, request, set, headers }) => {
  let clientIp = 
    headers['cf-connecting-ip'] || 
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['x-real-ip'] ||
    server?.requestIP(request)?.address;


  if (!clientIp || clientIp === "::1" || clientIp === "127.0.0.1" || clientIp === "localhost" || clientIp === "::ffff:127.0.0.1" || isReservedIpRange(clientIp)) {
    set.status = 400;
    return { success: false, error: "Invalid or local IP address. External access required." };
  }

  let geoIp: typeof geoIpLookupCache[string] | undefined = geoIpLookupCache[clientIp];
  if (geoIp) {
    if (geoIp.cacheExpireAt < new Date()) {
      delete geoIpLookupCache[clientIp];
      geoIp = undefined;
    }
  }
  
  if (!geoIp) {
    try {
      geoIp = await getGeoIp(clientIp);
    } catch (e) {
      set.status = 500;
      return { success: false, error: "Error fetching location data" };
    }
  }

  if (!geoIp) {
    set.status = 500;
    return { success: false, error: "Error fetching location data" };
  }

  let weather: typeof weatherLookupCache[string] | undefined = weatherLookupCache[`${geoIp.lat},${geoIp.lon}`];
  if (weather) {
    if (weather.cacheExpireAt < new Date()) {
      delete weatherLookupCache[`${geoIp.lat},${geoIp.lon}`];
      weather = undefined;
    }
  }
  
  if (!weather) {
    try {
      weather = await getWeather(geoIp.lat, geoIp.lon);
    } catch (e) {
      set.status = 500;
      return { success: false, error: "Error fetching weather data" };
    }
  }

  if (!weather) {
    set.status = 500;
    return { success: false, error: "Error fetching weather data" };
  }

  return {
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
  };
});

app.listen(3000, () => {
  console.log("🦊 Elysia is running at http://localhost:3000");
});

export default app;
