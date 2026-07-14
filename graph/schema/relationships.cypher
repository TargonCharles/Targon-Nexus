// =============================================================================
// Relationship Types — Definitions & Property Schema
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// All relationships in the Targon Nexus graph share a common set of provenance properties
// for auditability, confidence scoring, and evidence-based reasoning.
//
// Common Relationship Properties:
//   source      : String   — Provenance of this relationship (e.g., 'manual', 'ai_extracted',
//                            'semantic_scholar', 'crossref', 'lab_website', 'arxiv')
//   confidence  : Float    — 0.0–1.0 confidence score
//   collectedAt : DateTime — ISO 8601 timestamp when the relationship was first recorded
//   verifiedAt  : DateTime — ISO 8601 timestamp when the relationship was last verified
//   evidence    : String   — Human-readable justification / citation for the relationship
//   evidenceUrl : String   — URL to supporting evidence (paper, profile page, etc.)
// =============================================================================

// =============================================================================
// 1. Academic Mentorship Relationships
// =============================================================================

// ADVISOR_OF — Senior researcher advised/advises a junior researcher
// Direction: (advisor:Person)-[:ADVISOR_OF]->(student:Person)
// Properties: startYear, endYear, role ('phd_advisor' | 'postdoc_advisor' | 'ms_advisor' | 'undergrad_advisor')
//             + common relationship properties
//
// Example: (Z.-X. Shen)-[:ADVISOR_OF {role:'phd_advisor', startYear:2010}]->(Student)

// STUDENT_OF — Inverse of ADVISOR_OF; every ADVISOR_OF has a reciprocal STUDENT_OF
// Direction: (student:Person)-[:STUDENT_OF]->(advisor:Person)
// Properties: startYear, endYear, role, + common relationship properties

// =============================================================================
// 2. Collaboration Relationships
// =============================================================================

// COAUTHOR_WITH — Two researchers co-authored a paper together
// Direction: (author1:Person)-[:COAUTHOR_WITH]->(author2:Person)
// Properties: paperCount (Integer), firstYear, lastYear, papers ([String] — list of DOIs)
//             + common relationship properties
// Note: This is a derived/summary relationship; individual papers linked via AUTHORED_BY

// COLLABORATES_WITH — Broader collaboration between labs or persons
// Direction: (entity1)-[:COLLABORATES_WITH]->(entity2)
// Valid pairs: Person->Person, Lab->Lab, Person->Lab
// Properties: collaborationType ('joint_project' | 'joint_publication' | 'equipment_sharing' | 'personnel_exchange')
//             startYear, endYear, description
//             + common relationship properties

// =============================================================================
// 3. Organizational Affiliation Relationships
// =============================================================================

// MEMBER_OF — Person is currently a member of a Lab
// Direction: (person:Person)-[:MEMBER_OF]->(lab:Lab)
// Properties: role ('pi' | 'co_pi' | 'postdoc' | 'phd_student' | 'ms_student' | 'undergrad' | 'staff' | 'visitor')
//             startYear, endYear (null if current), title
//             + common relationship properties

// ALUMNI_OF — Person was formerly a member of a Lab
// Direction: (person:Person)-[:ALUMNI_OF]->(lab:Lab)
// Properties: role, startYear, endYear, currentPosition, currentInstitution
//             + common relationship properties

// WORKS_AT — Person works at a University/Institution (direct employment)
// Direction: (person:Person)-[:WORKS_AT]->(university:University)
// Properties: department, title, startYear, endYear
//             + common relationship properties

// AFFILIATED_WITH — Loose affiliation (visiting positions, adjunct, emeritus)
// Direction: (person:Person)-[:AFFILIATED_WITH]->(university:University)
// Properties: affiliationType, startYear, endYear
//             + common relationship properties

// HAS_MEMBER — Inverse of MEMBER_OF (Lab perspective)
// Direction: (lab:Lab)-[:HAS_MEMBER]->(person:Person)
// Properties: role, startYear, endYear, + common relationship properties

// HAS_ALUMNI — Inverse of ALUMNI_OF (Lab perspective)
// Direction: (lab:Lab)-[:HAS_ALUMNI]->(person:Person)
// Properties: role, startYear, endYear, + common relationship properties

// =============================================================================
// 4. Organizational Hierarchy Relationships
// =============================================================================

// BELONGS_TO — Lab belongs to a University
// Direction: (lab:Lab)-[:BELONGS_TO]->(university:University)
// Properties: department, school (String — specific school/department within university)
//             + common relationship properties

// PART_OF — One organization is part of a larger organization
// Direction: (child)-[:PART_OF]->(parent)
// Valid pairs: Lab->Lab, University->University, Lab->University
// Properties: + common relationship properties

// HAS_LAB — Inverse of BELONGS_TO (University perspective)
// Direction: (university:University)-[:HAS_LAB]->(lab:Lab)
// Properties: + common relationship properties

// HAS_SCHOOL — University has a school/college
// Direction: (university:University)-[:HAS_SCHOOL]->(school:University)
// Properties: schoolType ('engineering' | 'science' | 'medicine' | etc.)
//             + common relationship properties

// HAS_DEPARTMENT — University/School has a department
// Direction: (university:University)-[:HAS_DEPARTMENT]->(department:University)
// Properties: + common relationship properties

// =============================================================================
// 5. Research Taxonomy Relationships
// =============================================================================

// PARENT_OF — ResearchDirection is a parent of a more specific sub-direction
// Direction: (parent:ResearchDirection)-[:PARENT_OF]->(child:ResearchDirection)
// Properties: + common relationship properties

// RELATED_TO — Two ResearchDirections are related (cross-domain link)
// Direction: (rd1:ResearchDirection)-[:RELATED_TO]->(rd2:ResearchDirection)
// Properties: relationshipStrength (Float), description
//             + common relationship properties

// RESEARCHES_ON — Person or Lab actively researches a direction
// Direction: (person:Person|lab:Lab)-[:RESEARCHES_ON]->(rd:ResearchDirection)
// Properties: expertise ('primary' | 'secondary' | 'emerging')
//             + common relationship properties

// ABOUT — Paper is about a ResearchDirection
// Direction: (paper:Paper)-[:ABOUT]->(rd:ResearchDirection)
// Properties: relevance (Float 0.0–1.0)
//             + common relationship properties

// =============================================================================
// 6. Publication Relationships
// =============================================================================

// AUTHORED_BY — Paper was authored by a Person
// Direction: (paper:Paper)-[:AUTHORED_BY]->(person:Person)
// Properties: authorPosition (Integer — 1-indexed position in author list)
//             isCorresponding (Boolean), affiliationAtTime
//             + common relationship properties

// PUBLISHED — Inverse of AUTHORED_BY (Person perspective)
// Direction: (person:Person)-[:PUBLISHED]->(paper:Paper)
// Properties: authorPosition, isCorresponding
//             + common relationship properties

// PUBLISHED_IN — Paper was published in a journal/conference
// Direction: (paper:Paper)-[:PUBLISHED_IN]->(journal:Journal)
// Properties: volume, issue, pages, publicationDate
//             + common relationship properties
// Note: Journal nodes are optional; journal name may be stored as a Paper property instead.

// CITES — Paper cites another Paper
// Direction: (citing:Paper)-[:CITES]->(cited:Paper)
// Properties: context (String — excerpt of citing text), section
//             + common relationship properties

// =============================================================================
// 7. Equipment Relationships
// =============================================================================

// HAS_EQUIPMENT — Lab owns/houses an Equipment
// Direction: (lab:Lab)-[:HAS_EQUIPMENT]->(equipment:Equipment)
// Properties: acquisitionYear, status ('operational' | 'maintenance' | 'decommissioned')
//             + common relationship properties

// USED_BY — Equipment is used by a Person
// Direction: (equipment:Equipment)-[:USED_BY]->(person:Person)
// Properties: usageType ('primary_user' | 'occasional_user' | 'training')
//             startYear, endYear
//             + common relationship properties

// USED_FOR — Equipment is used for a ResearchDirection
// Direction: (equipment:Equipment)-[:USED_FOR]->(rd:ResearchDirection)
// Properties: relevance (Float), description
//             + common relationship properties

// =============================================================================
// 8. Identity Resolution Relationships
// =============================================================================

// ALIAS_OF — Link between duplicate/alternative Person records (identity resolution)
// Direction: (duplicate:Person)-[:ALIAS_OF]->(canonical:Person)
// Properties: matchType ('exact_match' | 'fuzzy_match' | 'name_variant' | 'institutional_change')
//             matchScore (Float)
//             + common relationship properties

// =============================================================================
// Relationship Cardinality Summary:
//
//   ADVISOR_OF        : (Person)-[:ADVISOR_OF]->(Person)          [1:N advisor->students]
//   STUDENT_OF        : (Person)-[:STUDENT_OF]->(Person)          [N:1 students->advisor]
//   COAUTHOR_WITH     : (Person)-[:COAUTHOR_WITH]->(Person)       [N:M]
//   MEMBER_OF         : (Person)-[:MEMBER_OF]->(Lab)              [N:1 person->lab]
//   ALUMNI_OF         : (Person)-[:ALUMNI_OF]->(Lab)              [N:M person->labs]
//   WORKS_AT          : (Person)-[:WORKS_AT]->(University)        [N:1 person->university]
//   AFFILIATED_WITH   : (Person)-[:AFFILIATED_WITH]->(University) [N:M]
//   BELONGS_TO        : (Lab)-[:BELONGS_TO]->(University)         [N:1 lab->university]
//   PART_OF            : (entity)-[:PART_OF]->(entity)             [N:1]
//   COLLABORATES_WITH : (entity)-[:COLLABORATES_WITH]->(entity)   [N:M]
//   HAS_EQUIPMENT     : (Lab)-[:HAS_EQUIPMENT]->(Equipment)       [1:N lab->equipment]
//   RESEARCHES_ON     : (Person|Lab)-[:RESEARCHES_ON]->(RD)       [N:M]
//   PUBLISHED         : (Person)-[:PUBLISHED]->(Paper)            [N:M]
//   HAS_MEMBER        : (Lab)-[:HAS_MEMBER]->(Person)             [1:N lab->members]
//   HAS_ALUMNI        : (Lab)-[:HAS_ALUMNI]->(Person)             [1:N lab->alumni]
//   PARENT_OF         : (RD)-[:PARENT_OF]->(RD)                   [1:N parent->children]
//   RELATED_TO        : (RD)-[:RELATED_TO]->(RD)                  [N:M]
//   ALIAS_OF          : (Person)-[:ALIAS_OF]->(Person)            [N:1 duplicates->canonical]
//   USED_BY           : (Equipment)-[:USED_BY]->(Person)          [N:M]
//   USED_FOR          : (Equipment)-[:USED_FOR]->(RD)             [N:M]
//   AUTHORED_BY       : (Paper)-[:AUTHORED_BY]->(Person)          [N:M paper->authors]
//   PUBLISHED_IN      : (Paper)-[:PUBLISHED_IN]->(*)               [N:1 paper->venue]
//   CITES             : (Paper)-[:CITES]->(Paper)                 [N:M]
//   ABOUT             : (Paper)-[:ABOUT]->(RD)                    [N:M]
//   HAS_SCHOOL        : (University)-[:HAS_SCHOOL]->(University)  [1:N]
//   HAS_DEPARTMENT    : (University)-[:HAS_DEPARTMENT]->(University) [1:N]
//   HAS_LAB           : (University)-[:HAS_LAB]->(Lab)            [1:N]
// =============================================================================
