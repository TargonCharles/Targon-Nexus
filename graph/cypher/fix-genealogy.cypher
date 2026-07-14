MATCH ()-[r:ADVISOR_OF]->(p:Person {uuid:'person-feng-dl'}) WHERE r.sourceUrl CONTAINS 'lab' DELETE r;
MATCH (a:Person {uuid:'person-zx-shen'}), (b:Person {uuid:'person-feng-dl'}) MERGE (a)-[:ADVISOR_OF {confidence:1.0}]->(b);
MATCH (a:Person {uuid:'person-zx-shen'}), (b:Person {uuid:'person-wang-sc'}) MERGE (a)-[:ADVISOR_OF {confidence:1.0}]->(b);
MATCH (a:Person {uuid:'person-zx-shen'}), (b:Person {uuid:'person-he-y'}) MERGE (a)-[:ADVISOR_OF {confidence:1.0}]->(b);
MATCH (a:Person {uuid:'person-zx-shen'}), (b:Person {uuid:'person-zhang-wt'}) MERGE (a)-[:ADVISOR_OF {confidence:1.0}]->(b);
MATCH (a:Person {uuid:'person-zx-shen'}), (b:Person {uuid:'person-ychen'}) MERGE (a)-[:ADVISOR_OF {confidence:1.0}]->(b);
RETURN 'Genealogy fixed' AS result;
