// Demo relationships — use actual UUIDs from the current database
// Equipment linked to labs, people linked to research directions

MATCH (lab:Lab {uuid: 'lab-shen-arpes'}), (eq:Equipment {uuid: 'eq-laser'})
MERGE (lab)-[:HAS_EQUIPMENT {confidence: 1.0}]->(eq);

MATCH (lab:Lab {uuid: 'lab-shen-arpes'}), (eq:Equipment {uuid: 'eq-arpes'})
MERGE (lab)-[:HAS_EQUIPMENT {confidence: 1.0}]->(eq);

MATCH (p:Person {uuid: 'person-zx-shen'}), (rd:ResearchDirection {uuid: 'rd-quantum'})
MERGE (p)-[:RESEARCHES_ON {confidence: 1.0}]->(rd);

MATCH (lab:Lab {uuid: 'lab-shen-arpes'}), (rd:ResearchDirection {uuid: 'rd-quantum'})
MERGE (lab)-[:RESEARCHES_ON {confidence: 1.0}]->(rd);

RETURN 'Demo relationships created' AS result;
