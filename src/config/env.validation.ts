import { plainToInstance } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV!: string;

  @IsNumberString()
  PORT!: string;

  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsNotEmpty()
  REDIS_HOST!: string;

  @IsNumberString()
  REDIS_PORT!: string;

  @IsNotEmpty()
  REDIS_PASSWORD!: string;

  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsNotEmpty()
  WHATSAPP_VERIFY_TOKEN!: string;

  @IsOptional()
  @IsString()
  WHATSAPP_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_ACCESS_TOKEN?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_PHONE_NUMBER_ID?: string;

  @IsOptional()
  @IsString()
  WHATSAPP_SUPPORT_NUMBER?: string;

  // Comma-separated number(s) allowed to use the #savetomemory tag to store internal notes.
  @IsOptional()
  @IsString()
  ADMIN_WHATSAPP_NUMBER?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }

  return validated;
}
