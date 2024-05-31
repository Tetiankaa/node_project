import dotenv from "dotenv";

dotenv.config();

export const config = {
  PORT: Number(process.env.PORT),
  HOST: process.env.HOST,
  MONGO_URL: process.env.MONGO_URL,
  HASH_PASSWORD_ROUNDS: Number(process.env.HASH_PASSWORD_ROUNDS),
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  MANAGER_EMAIL: process.env.MANAGER_EMAIL,
  MAX_PROFANITY_EDITS: Number(process.env.MAX_PROFANITY_EDITS),
};
