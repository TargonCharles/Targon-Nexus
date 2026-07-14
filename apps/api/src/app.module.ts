import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth';
import { Neo4jModule } from './neo4j/neo4j.module';
import { SearchModule } from './search/search.module';
import { PersonModule } from './person/person.module';
import { LabModule } from './lab/lab.module';
import { EquipmentModule } from './equipment/equipment.module';
import { DirectionModule } from './direction/direction.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { PaperModule } from './paper/paper.module';
import { FacilityModule } from './facility/facility.module';
import { GraphQLApiModule } from './graphql/graphql.module';
import { VectorModule } from './vector/vector.module';
import { QualityModule } from './quality/quality.module';
import { IntegrationModule } from './integration/integration.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    Neo4jModule,
    SearchModule,
    PersonModule,
    LabModule,
    EquipmentModule,
    DirectionModule,
    PipelineModule,
    PaperModule,
    FacilityModule,
    GraphQLApiModule,
    VectorModule,
    QualityModule,
    IntegrationModule,
  ],
})
export class AppModule {}
