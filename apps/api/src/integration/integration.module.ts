import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { ExternalApiService } from './external-api.service';
import { EquipmentIntelService } from './equipment-intel.service';
import { Neo4jModule } from '../neo4j/neo4j.module';

@Module({
  imports: [Neo4jModule],
  controllers: [IntegrationController],
  providers: [ExternalApiService, EquipmentIntelService],
  exports: [ExternalApiService, EquipmentIntelService],
})
export class IntegrationModule {}
