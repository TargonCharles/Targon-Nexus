// =============================================================================
// GraphQL Module — V1.5
// 基于 @nestjs/graphql 的 Apollo Server，替代 REST 的部分灵活查询
// =============================================================================

import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLResolver } from './graphql.resolver';
import { Neo4jModule } from '../neo4j/neo4j.module';
import { SearchModule } from '../search/search.module';
import { join } from 'path';

@Module({
  imports: [
    Neo4jModule,
    SearchModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'apps/api/src/graphql/schema.gql'),
      sortSchema: true,
      playground: process.env.GRAPHQL_PLAYGROUND === 'true',
      introspection: true,
      path: '/api/graphql',
    }),
  ],
  providers: [GraphQLResolver],
})
export class GraphQLApiModule {}
