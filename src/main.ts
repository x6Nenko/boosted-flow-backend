import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import session from 'express-session';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // Enable shutdown hooks for graceful shutdown (required by Terminus)
  app.enableShutdownHooks();

  // Trust proxy in production (required for secure cookies behind DO load balancer)
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Enable CORS with credentials support for HTTP-only cookies
  app.enableCors({
    origin: configService.get<string>('frontend.url'),
    credentials: true,
  });

  // Enable cookie parser middleware
  app.use(cookieParser());

  app.use(
    session({
      secret: configService.getOrThrow<string>('session.secret'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    }),
  );

  const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(logFormat));

  // Setup Swagger only in development
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Boosted Flow API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
