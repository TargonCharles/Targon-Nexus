import { Global, Module } from '@nestjs/common';
import { LockService } from './lock.service';
import { HttpClientService } from './http-client.service';
import { LlmClientService } from './llm-client.service';

@Global()
@Module({
  providers: [LockService, HttpClientService, LlmClientService],
  exports: [LockService, HttpClientService, LlmClientService],
})
export class CommonModule {}
