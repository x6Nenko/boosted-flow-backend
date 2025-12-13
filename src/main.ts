import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable CORS with credentials support for HTTP-only cookies
  app.enableCors({
    origin: configService.get<string>('frontend.url'),
    credentials: true,
  });

  // Enable cookie parser middleware
  app.use(cookieParser());

  const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(logFormat));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
