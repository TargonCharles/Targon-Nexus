import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { initTelemetry } from '@arp/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  // Initialize OpenTelemetry before anything else
  await initTelemetry('api');

  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // --- CORS ---
  const corsOriginRaw = process.env.CORS_ORIGIN?.trim();
  const corsOrigin = corsOriginRaw
    ? corsOriginRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:3000'];

  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
  });

  // --- Global prefix ---
  app.setGlobalPrefix('api/v1');

  // --- Validation ---
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // --- Health check (no auth required) ---
  // Used by nginx, Docker HEALTHCHECK, and k8s liveness/readiness probes.
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: any, res: any) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // --- Swagger ---
  const config = new DocumentBuilder()
    .setTitle('Targon Nexus API — 学术关系平台')
    .setDescription('ARPES 研究社区知识图谱 API。提供人物、实验室、设备、论文、研究方向等知识图谱实体的查询和图遍历能力。')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('实体', '知识图谱实体（人物、实验室、论文等）')
    .addTag('图谱', '图遍历与关系查询')
    .addTag('搜索', '全文与语义搜索')
    .addTag('数据管道', '数据采集与入库端点')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // --- Start ---
  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);

  logger.log(`Targon Nexus API 已启动: http://localhost:${port}`);
  logger.log(`Swagger 文档: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('API 服务启动失败', err);
  process.exit(1);
});
