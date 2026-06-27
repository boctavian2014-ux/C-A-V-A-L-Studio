import cors from "cors";
import type { CorsOptions } from "cors";

const parseAllowedOrigins = (): string[] => {
  const raw = process.env.CAD_CORS_ORIGIN?.trim();
  if (!raw || raw === "*") {
    return ["http://localhost:5173", "http://127.0.0.1:5173", "app://.", "file://"];
  }
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
};

export const cadCorsMiddleware = (): ReturnType<typeof cors> => {
  const allowed = parseAllowedOrigins();
  const options: CorsOptions = {
    origin(origin, callback) {
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-cad-api-key",
      "x-caval-user-id",
    ],
    maxAge: 600,
  };
  return cors(options);
};
