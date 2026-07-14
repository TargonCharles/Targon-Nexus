import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

export interface CareerEvent {
  uuid: string;
  personUuid: string;
  personName: string;
  eventType: 'graduation' | 'appointment' | 'promotion' | 'departure' | 'award' | 'publication';
  institution?: string;
  position?: string;
  startYear?: number;
  endYear?: number;
  description: string;
  confidence: number;
}

@Injectable()
export class CareerPathService {
  private readonly logger = new Logger(CareerPathService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 获取人物的职业轨迹 */
  async getCareerTimeline(personUuid: string): Promise<CareerEvent[]> {
    return this.neo4j.read<CareerEvent>(
      `MATCH (p:Person {uuid: $uuid})
       OPTIONAL MATCH (p)-[:HAS_CAREER_EVENT]->(e:CareerEvent)
       RETURN e.uuid AS uuid, p.uuid AS personUuid,
              coalesce(p.chineseName, p.englishName) AS personName,
              e.eventType AS eventType, e.institution AS institution,
              e.position AS position, e.startYear AS startYear,
              e.endYear AS endYear, e.description AS description,
              coalesce(e.confidence, 0.8) AS confidence
       ORDER BY e.startYear`,
      { uuid: personUuid },
    );
  }

  /** 从已知数据自动生成职业轨迹 */
  async generateCareerPath(personUuid: string): Promise<{ created: number }> {
    let created = 0;

    // 1. 从 ADVISOR_OF（被导师关系）推断教育经历
    const eduInfo = await this.neo4j.read<{
      advisor: string; role: string; startYear: number;
      labName: string; univName: string;
    }>(
      `MATCH (p:Person {uuid: $uuid})<-[r:ADVISOR_OF]-(advisor:Person)
       OPTIONAL MATCH (p)-[:MEMBER_OF]->(lab:Lab)-[:BELONGS_TO]->(univ:University)
       RETURN advisor.englishName AS advisor, r.role AS role,
              coalesce(r.startYear, 2005) AS startYear,
              lab.name AS labName, univ.englishName AS univName
       LIMIT 3`,
      { uuid: personUuid },
    );

    for (const edu of eduInfo) {
      const degree = edu.role?.includes('postdoc') ? 'Postdoc' : 'PhD';
      const desc = `${degree} under ${edu.advisor} at ${edu.univName || edu.labName || 'Unknown'}`;
      await this.createEvent(personUuid, {
        eventType: degree === 'PhD' ? 'graduation' : 'appointment',
        institution: edu.univName || edu.labName,
        position: degree === 'PhD' ? 'PhD Student' : 'Postdoctoral Researcher',
        startYear: edu.startYear,
        endYear: edu.startYear + (degree === 'PhD' ? 5 : 3),
        description: desc,
        confidence: 0.8,
      });
      created++;
    }

    // 2. 从 AFFILIATED_WITH 推断当前职位
    const affInfo = await this.neo4j.read<{ univ: string; lab: string }>(
      `MATCH (p:Person {uuid: $uuid})-[r:AFFILIATED_WITH]->(u:University)
       OPTIONAL MATCH (p)-[:MEMBER_OF]->(lab:Lab)
       RETURN u.englishName AS univ, lab.name AS lab
       LIMIT 1`,
      { uuid: personUuid },
    );

    for (const aff of affInfo) {
      await this.createEvent(personUuid, {
        eventType: 'appointment',
        institution: aff.univ || aff.lab,
        position: 'Professor',
        startYear: 2010,
        description: `Faculty position at ${aff.univ || aff.lab}`,
        confidence: 0.8,
      });
      created++;
    }

    return { created };
  }

  /** 创建单条职业事件 */
  private async createEvent(
    personUuid: string,
    params: Omit<CareerEvent, 'uuid' | 'personUuid' | 'personName'>,
  ): Promise<string> {
    const uuid = `ce-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await this.neo4j.write(
      `MATCH (p:Person {uuid: $personUuid})
       CREATE (e:CareerEvent {
         uuid: $uuid, eventType: $type, institution: $inst,
         position: $pos, startYear: $sY, endYear: $eY,
         description: $desc, confidence: $conf,
         createdAt: datetime()
       })
       CREATE (p)-[:HAS_CAREER_EVENT]->(e)
       RETURN e.uuid`,
      {
        personUuid, uuid,
        type: params.eventType, inst: params.institution || null,
        pos: params.position || null, sY: params.startYear,
        eY: params.endYear, desc: params.description,
        conf: params.confidence,
      },
    );

    return uuid;
  }

  /** 批量为核心人物创建职业轨迹 */
  async backfillKeyPeople(): Promise<{ processed: number; events: number }> {
    const people = await this.neo4j.read<{ uuid: string; name: string }>(
      `MATCH (p:Person)
       WHERE EXISTS { (p)-[:ADVISOR_OF]->(:Person) }  // 有学生的人
          OR EXISTS { (:Person)-[:ADVISOR_OF]->(p) }  // 有导师的人
       RETURN p.uuid AS uuid, p.englishName AS name
       LIMIT 30`,
    );

    let totalEvents = 0;
    for (const p of people) {
      const { created } = await this.generateCareerPath(p.uuid);
      totalEvents += created;
    }

    this.logger.log(`CareerPath backfill: ${people.length} people, ${totalEvents} events`);
    return { processed: people.length, events: totalEvents };
  }
}
