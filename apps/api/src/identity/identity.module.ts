import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { Neo4jModule } from '../neo4j/neo4j.module';

@Module({
  imports: [Neo4jModule],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
