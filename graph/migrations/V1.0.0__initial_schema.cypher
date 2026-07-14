// =============================================================================
// Migration: V1.0.0 閳?Initial Schema
// ARP (Targon Nexus) 閳?ARPES Research Community
// =============================================================================
// Purpose: Create all constraints, indexes, and seed the ARPES research
//          direction taxonomy with parent-child relationships.
// Author:  Targon Nexus Team
// Date:    2026-07-10
// =============================================================================

// =============================================================================
// PHASE 1: Uniqueness Constraints & Node Keys
// =============================================================================

// --- Person ---
CREATE CONSTRAINT person_uuid_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.uuid IS UNIQUE;
CREATE CONSTRAINT person_uuid_key IF NOT EXISTS
FOR (p:Person) REQUIRE (p.uuid) IS NODE KEY;

// --- Lab ---
CREATE CONSTRAINT lab_uuid_unique IF NOT EXISTS
FOR (l:Lab) REQUIRE l.uuid IS UNIQUE;
CREATE CONSTRAINT lab_uuid_key IF NOT EXISTS
FOR (l:Lab) REQUIRE (l.uuid) IS NODE KEY;

// --- University ---
CREATE CONSTRAINT university_uuid_unique IF NOT EXISTS
FOR (u:University) REQUIRE u.uuid IS UNIQUE;
CREATE CONSTRAINT university_uuid_key IF NOT EXISTS
FOR (u:University) REQUIRE (u.uuid) IS NODE KEY;

// --- Equipment ---
CREATE CONSTRAINT equipment_uuid_unique IF NOT EXISTS
FOR (e:Equipment) REQUIRE e.uuid IS UNIQUE;
CREATE CONSTRAINT equipment_uuid_key IF NOT EXISTS
FOR (e:Equipment) REQUIRE (e.uuid) IS NODE KEY;

// --- Research Direction ---
CREATE CONSTRAINT research_direction_uuid_unique IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE rd.uuid IS UNIQUE;
CREATE CONSTRAINT research_direction_uuid_key IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE (rd.uuid) IS NODE KEY;
CREATE CONSTRAINT research_direction_name_level_unique IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE (rd.name, rd.level) IS UNIQUE;

// --- Paper ---
CREATE CONSTRAINT paper_uuid_unique IF NOT EXISTS
FOR (p:Paper) REQUIRE p.uuid IS UNIQUE;
CREATE CONSTRAINT paper_doi_unique IF NOT EXISTS
FOR (p:Paper) REQUIRE p.doi IS UNIQUE;
CREATE CONSTRAINT paper_uuid_key IF NOT EXISTS
FOR (p:Paper) REQUIRE (p.uuid) IS NODE KEY;

// =============================================================================
// PHASE 2: Lookup Indexes
// =============================================================================

// --- Person ---
CREATE INDEX person_chinese_name_idx IF NOT EXISTS      FOR (p:Person) ON (p.chineseName);
CREATE INDEX person_english_name_idx IF NOT EXISTS      FOR (p:Person) ON (p.englishName);
CREATE INDEX person_orcid_idx IF NOT EXISTS             FOR (p:Person) ON (p.orcid);
CREATE INDEX person_google_scholar_idx IF NOT EXISTS    FOR (p:Person) ON (p.googleScholar);
CREATE INDEX person_email_idx IF NOT EXISTS             FOR (p:Person) ON (p.email);
CREATE INDEX person_status_idx IF NOT EXISTS            FOR (p:Person) ON (p.currentStatus);
CREATE INDEX person_name_status_idx IF NOT EXISTS       FOR (p:Person) ON (p.englishName, p.currentStatus);
CREATE INDEX person_created_at_idx IF NOT EXISTS        FOR (p:Person) ON (p.createdAt);
CREATE INDEX person_last_verified_idx IF NOT EXISTS     FOR (p:Person) ON (p.lastVerified);

// --- Lab ---
CREATE INDEX lab_name_idx IF NOT EXISTS                 FOR (l:Lab) ON (l.name);
CREATE INDEX lab_english_name_idx IF NOT EXISTS         FOR (l:Lab) ON (l.englishName);
CREATE INDEX lab_abbreviation_idx IF NOT EXISTS         FOR (l:Lab) ON (l.abbreviation);
CREATE INDEX lab_country_idx IF NOT EXISTS              FOR (l:Lab) ON (l.country);
CREATE INDEX lab_city_idx IF NOT EXISTS                 FOR (l:Lab) ON (l.city);
CREATE INDEX lab_status_idx IF NOT EXISTS               FOR (l:Lab) ON (l.currentStatus);
CREATE INDEX lab_country_city_idx IF NOT EXISTS         FOR (l:Lab) ON (l.country, l.city);
CREATE INDEX lab_founded_year_idx IF NOT EXISTS         FOR (l:Lab) ON (l.foundedYear);

// --- University ---
CREATE INDEX university_chinese_name_idx IF NOT EXISTS   FOR (u:University) ON (u.chineseName);
CREATE INDEX university_english_name_idx IF NOT EXISTS   FOR (u:University) ON (u.englishName);
CREATE INDEX university_country_idx IF NOT EXISTS        FOR (u:University) ON (u.country);
CREATE INDEX university_city_idx IF NOT EXISTS           FOR (u:University) ON (u.city);
CREATE INDEX university_country_city_idx IF NOT EXISTS   FOR (u:University) ON (u.country, u.city);

// --- Equipment ---
CREATE INDEX equipment_name_idx IF NOT EXISTS            FOR (e:Equipment) ON (e.name);
CREATE INDEX equipment_brand_idx IF NOT EXISTS           FOR (e:Equipment) ON (e.brand);
CREATE INDEX equipment_manufacturer_idx IF NOT EXISTS    FOR (e:Equipment) ON (e.manufacturer);
CREATE INDEX equipment_category_idx IF NOT EXISTS        FOR (e:Equipment) ON (e.category);
CREATE INDEX equipment_brand_model_idx IF NOT EXISTS     FOR (e:Equipment) ON (e.brand, e.model);

// --- Research Direction ---
CREATE INDEX research_direction_name_idx IF NOT EXISTS   FOR (rd:ResearchDirection) ON (rd.name);
CREATE INDEX research_direction_level_idx IF NOT EXISTS  FOR (rd:ResearchDirection) ON (rd.level);
CREATE INDEX research_direction_level_name_idx IF NOT EXISTS FOR (rd:ResearchDirection) ON (rd.level, rd.name);

// --- Paper ---
CREATE INDEX paper_title_idx IF NOT EXISTS               FOR (p:Paper) ON (p.title);
CREATE INDEX paper_journal_idx IF NOT EXISTS             FOR (p:Paper) ON (p.journal);
CREATE INDEX paper_conference_idx IF NOT EXISTS          FOR (p:Paper) ON (p.conference);
CREATE INDEX paper_year_idx IF NOT EXISTS                FOR (p:Paper) ON (p.year);
CREATE INDEX paper_citation_count_idx IF NOT EXISTS      FOR (p:Paper) ON (p.citationCount);
CREATE INDEX paper_source_idx IF NOT EXISTS              FOR (p:Paper) ON (p.source);
CREATE INDEX paper_year_citations_idx IF NOT EXISTS      FOR (p:Paper) ON (p.year, p.citationCount);

// =============================================================================
// PHASE 3: Full-Text Search Indexes
// =============================================================================

CREATE FULLTEXT INDEX person_fulltext IF NOT EXISTS
FOR (p:Person) ON EACH [p.chineseName, p.englishName, p.biography, p.researchInterests]
OPTIONS {indexConfig: {`fulltext.analyzer`: 'standard', `fulltext.eventually_consistent`: true}};

CREATE FULLTEXT INDEX lab_fulltext IF NOT EXISTS
FOR (l:Lab) ON EACH [l.name, l.englishName, l.description, l.keywords]
OPTIONS {indexConfig: {`fulltext.analyzer`: 'standard', `fulltext.eventually_consistent`: true}};

CREATE FULLTEXT INDEX university_fulltext IF NOT EXISTS
FOR (u:University) ON EACH [u.chineseName, u.englishName, u.description]
OPTIONS {indexConfig: {`fulltext.analyzer`: 'standard', `fulltext.eventually_consistent`: true}};

CREATE FULLTEXT INDEX equipment_fulltext IF NOT EXISTS
FOR (e:Equipment) ON EACH [e.name, e.description, e.keywords, e.brand, e.model]
OPTIONS {indexConfig: {`fulltext.analyzer`: 'standard', `fulltext.eventually_consistent`: true}};

CREATE FULLTEXT INDEX research_direction_fulltext IF NOT EXISTS
FOR (rd:ResearchDirection) ON EACH [rd.name, rd.description, rd.aliases]
OPTIONS {indexConfig: {`fulltext.analyzer`: 'standard', `fulltext.eventually_consistent`: true}};

CREATE FULLTEXT INDEX paper_fulltext IF NOT EXISTS
FOR (p:Paper) ON EACH [p.title, p.keywords]
OPTIONS {indexConfig: {`fulltext.analyzer`: 'standard', `fulltext.eventually_consistent`: true}};

// =============================================================================
// PHASE 4: Seed Taxonomy 閳?ARPES Research Directions
// =============================================================================
// The taxonomy follows a 4-level hierarchy:
//   Level 0 閳?Root domain
//   Level 1 閳?Major research themes
//   Level 2 閳?Specific sub-fields
//   Level 3 閳?Focused research topics (especially ARPES techniques)
// =============================================================================

// ---------------------------------------------------------------------------
// Level 0 閳?Root
// ---------------------------------------------------------------------------
CREATE (:ResearchDirection {
    uuid:        'rd-root-condensed-matter',
    name:        'Condensed Matter Physics',
    level:       0,
    description: 'Study of the macroscopic and microscopic physical properties of matter in condensed phases.',
    aliases:     ['CMP', 'Solid State Physics'],
    createdAt:   datetime(),
    updatedAt:   datetime()
});

// ---------------------------------------------------------------------------
// Level 1 閳?Major Themes (10 nodes)
// ---------------------------------------------------------------------------
CREATE (:ResearchDirection {
    uuid: 'rd-l1-quantum-materials', name: 'Quantum Materials', level: 1,
    description: 'Materials whose properties are dominated by quantum mechanical effects at the macroscopic scale.',
    aliases: ['Quantum Matter', 'Quantum Condensed Matter'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-topological-materials', name: 'Topological Materials', level: 1,
    description: 'Materials with non-trivial topological invariants giving rise to protected surface/edge states.',
    aliases: ['Topological Phases', 'Topological Quantum Matter'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-strong-correlation', name: 'Strongly Correlated Electron Systems', level: 1,
    description: 'Materials where electron-electron interactions dominate, leading to emergent phenomena.',
    aliases: ['Strong Correlation', 'Correlated Electrons'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-spin-physics', name: 'Spin Physics', level: 1,
    description: 'Spin-dependent phenomena including spin-orbit coupling, magnetic ordering, and spin textures.',
    aliases: ['Spin Phenomena', 'Spin-Dependent Physics', 'Spintronics'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-2d-materials', name: 'Two-Dimensional Materials', level: 1,
    description: 'Atomically thin materials with unique electronic, optical, and mechanical properties.',
    aliases: ['2D Materials', 'Layered Materials', 'van der Waals Materials'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-surface-physics', name: 'Surface and Interface Physics', level: 1,
    description: 'Physical and chemical phenomena at surfaces and interfaces of materials.',
    aliases: ['Surface Science', 'Interface Physics', 'Surface States'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-superconductors', name: 'Superconductivity', level: 1,
    description: 'Materials exhibiting zero electrical resistance below a critical temperature.',
    aliases: ['Superconductors', 'SC', 'High-Tc Superconductivity'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-dirac-materials', name: 'Dirac and Weyl Materials', level: 1,
    description: 'Materials hosting Dirac/Weyl quasiparticles including graphene, Dirac/Weyl semimetals.',
    aliases: ['Dirac Materials', 'Weyl Semimetals', 'Relativistic Condensed Matter'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-charge-density-wave', name: 'Charge Density Wave Systems', level: 1,
    description: 'Materials with periodic modulation of electronic charge density coupled to lattice distortion.',
    aliases: ['CDW', 'Charge Order', 'Peierls Transition'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l1-heavy-fermion', name: 'Heavy Fermion Systems', level: 1,
    description: 'Intermetallic compounds with f-electron elements exhibiting large effective masses.',
    aliases: ['Heavy Fermion', 'f-electron Systems', 'Kondo Lattice'],
    createdAt: datetime(), updatedAt: datetime()
});

// ---------------------------------------------------------------------------
// Level 2 閳?Sub-fields (17 nodes)
// ---------------------------------------------------------------------------
// Quantum Materials children
CREATE (:ResearchDirection {
    uuid: 'rd-l2-kagome', name: 'Kagome Lattice Materials', level: 2,
    description: 'Materials with kagome lattice geometry exhibiting flat bands and Dirac cones.',
    aliases: ['Kagome Metals', 'Kagome Superconductors'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-moire', name: 'Moire Heterostructures', level: 2,
    description: 'Twisted 2D stacks with moire superlattices creating flat bands and correlated phases.',
    aliases: ['Twisted Bilayers', 'Magic Angle Graphene', 'Moire Superlattices'],
    createdAt: datetime(), updatedAt: datetime()
});

// Topological Materials children
CREATE (:ResearchDirection {
    uuid: 'rd-l2-topological-insulators', name: 'Topological Insulators', level: 2,
    description: 'Bulk insulators with conducting surface states protected by time-reversal symmetry.',
    aliases: ['TI', '3D TI', '2D TI', 'Quantum Spin Hall'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-weyl-semimetals', name: 'Weyl Semimetals', level: 2,
    description: 'Semimetals with non-degenerate band crossings producing Fermi arcs on surfaces.',
    aliases: ['WSM', 'Type-I Weyl', 'Type-II Weyl', 'Magnetic Weyl'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-dirac-semimetals', name: 'Dirac Semimetals', level: 2,
    description: 'Semimetals with four-fold degenerate band crossings hosting 3D Dirac fermions.',
    aliases: ['DSM', '3D Dirac', 'Cd3As2', 'Na3Bi'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-axion-insulators', name: 'Axion Insulators', level: 2,
    description: 'Antiferromagnetic topological insulators with quantized magnetoelectric effect.',
    aliases: ['Axion Topological Insulator', 'Quantized Magnetoelectric Effect'],
    createdAt: datetime(), updatedAt: datetime()
});

// Strong Correlation children
CREATE (:ResearchDirection {
    uuid: 'rd-l2-mott-insulators', name: 'Mott Insulators', level: 2,
    description: 'Materials insulating due to strong electron-electron Coulomb repulsion.',
    aliases: ['Mott Transition', 'Mott-Hubbard', 'Hubbard Model'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-cuprates', name: 'Cuprate Superconductors', level: 2,
    description: 'Layered copper-oxide compounds with d-wave high-temperature superconductivity.',
    aliases: ['Cuprates', 'High-Tc Cuprates', 'BSCCO', 'YBCO'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-iron-pnictides', name: 'Iron-Based Superconductors', level: 2,
    description: 'Iron-pnictide/chalcogenide compounds with multi-orbital unconventional superconductivity.',
    aliases: ['FeSC', 'Iron Pnictides', 'FeSe', 'BaFe2As2'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-nickelates', name: 'Nickelate Superconductors', level: 2,
    description: 'Infinite-layer nickelate compounds exhibiting superconductivity analogous to cuprates.',
    aliases: ['Infinite-Layer Nickelates', 'NdNiO2', 'Ruddlesden-Popper Nickelates'],
    createdAt: datetime(), updatedAt: datetime()
});

// Spin Physics children
CREATE (:ResearchDirection {
    uuid: 'rd-l2-rashba', name: 'Rashba Effect and Spin Splitting', level: 2,
    description: 'Momentum-dependent spin splitting from spin-orbit coupling without inversion symmetry.',
    aliases: ['Rashba Effect', 'Rashba-Dresselhaus', 'Spin-Orbit Coupling'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-spin-texture', name: 'Spin Texture and Chirality', level: 2,
    description: 'Momentum-space spin configurations: spin-momentum locking, hedgehog, chiral structures.',
    aliases: ['Spin Texture', 'Spin-Momentum Locking', 'Chiral Spin', 'Spin Helicity'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-magnetic-materials', name: 'Magnetic Materials', level: 2,
    description: 'Materials with ordered magnetic moments: ferro-, antiferro-, ferri-, frustrated magnets.',
    aliases: ['Magnetism', 'Antiferromagnets', 'Ferromagnets', 'Magnetic Order'],
    createdAt: datetime(), updatedAt: datetime()
});

// 2D Materials children
CREATE (:ResearchDirection {
    uuid: 'rd-l2-graphene', name: 'Graphene', level: 2,
    description: 'Single-layer carbon honeycomb lattice hosting massless Dirac fermions.',
    aliases: ['Monolayer Graphene', 'Bilayer Graphene', 'Trilayer Graphene'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-tmd', name: 'Transition Metal Dichalcogenides', level: 2,
    description: 'MX2 layered materials (Mo,W; S,Se,Te) with CDW, SC, and valleytronic phases.',
    aliases: ['TMD', 'TMDC', 'MoS2', 'WSe2', 'MoTe2'],
    createdAt: datetime(), updatedAt: datetime()
});

// Superconductivity children
CREATE (:ResearchDirection {
    uuid: 'rd-l2-unconventional-sc', name: 'Unconventional Superconductivity', level: 2,
    description: 'Superconductivity beyond BCS: d-wave, p-wave, and exotic pairing symmetries.',
    aliases: ['Unconventional SC', 'Non-BCS', 'Exotic Pairing', 'Odd-Parity SC'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l2-superconducting-gap', name: 'Superconducting Gap Structure', level: 2,
    description: 'Momentum/energy dependence of the order parameter studied via ARPES and STM.',
    aliases: ['SC Gap', 'Order Parameter', 'Pairing Symmetry', 'Gap Anisotropy'],
    createdAt: datetime(), updatedAt: datetime()
});

// ---------------------------------------------------------------------------
// Level 3 閳?ARPES-Specific Topics (7 nodes)
// ---------------------------------------------------------------------------
CREATE (:ResearchDirection {
    uuid: 'rd-l3-arpes', name: 'Angle-Resolved Photoemission Spectroscopy', level: 3,
    description: 'Direct measurement of electronic band structure and spectral function via photoelectric effect.',
    aliases: ['ARPES', 'Angle-Resolved Photoemission', 'Photoemission Spectroscopy'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l3-nano-arpes', name: 'Nano-ARPES', level: 3,
    description: 'Spatially-resolved ARPES with sub-micron resolution for micro-structured materials.',
    aliases: ['NanoARPES', 'Micro-ARPES', 'Spatially Resolved ARPES', 'mu-ARPES'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l3-tr-arpes', name: 'Time-Resolved ARPES', level: 3,
    description: 'Ultrafast pump-probe ARPES capturing electronic dynamics on femtosecond timescales.',
    aliases: ['trARPES', 'Time-Resolved Photoemission', 'Femtosecond ARPES', 'Pump-Probe ARPES'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l3-spin-arpes', name: 'Spin-Resolved ARPES', level: 3,
    description: 'ARPES with spin detection (Mott/VLEED/SPLEED) resolving photoelectron spin polarization.',
    aliases: ['Spin-ARPES', 'SARPES', 'Spin-Resolved Photoemission', 'Spin-Polarized ARPES'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l3-resonant-arpes', name: 'Resonant ARPES', level: 3,
    description: 'ARPES at core-level absorption edges enhancing specific orbital contributions.',
    aliases: ['Res-ARPES', 'Resonant Photoemission', 'RPES'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l3-dichroism-arpes', name: 'Dichroism ARPES', level: 3,
    description: 'Polarization-dependent ARPES probing orbital angular momentum and chirality.',
    aliases: ['CD-ARPES', 'LD-ARPES', 'Circular Dichroism', 'Linear Dichroism'],
    createdAt: datetime(), updatedAt: datetime()
});
CREATE (:ResearchDirection {
    uuid: 'rd-l3-in-situ-arpes', name: 'In-Situ ARPES', level: 3,
    description: 'ARPES on samples prepared/characterized in UHV without breaking vacuum.',
    aliases: ['In-Situ Photoemission', 'UHV ARPES', 'Integrated MBE-ARPES'],
    createdAt: datetime(), updatedAt: datetime()
});

// =============================================================================
// PHASE 5: Seed Taxonomy Relationships (PARENT_OF)
// =============================================================================

// --- Level 0 -> Level 1 (10 edges) ---
MATCH (root:ResearchDirection {uuid: 'rd-root-condensed-matter'})
MATCH (child:ResearchDirection)
WHERE child.uuid STARTS WITH 'rd-l1-'
CREATE (root)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(child);

// --- Level 1 -> Level 2 ---
// Quantum Materials -> Kagome, Moire
MATCH (p:ResearchDirection {uuid: 'rd-l1-quantum-materials'})
MATCH (c:ResearchDirection) WHERE c.uuid IN ['rd-l2-kagome', 'rd-l2-moire']
CREATE (p)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(c);

// Topological Materials -> TI, Weyl, Dirac, Axion
MATCH (p:ResearchDirection {uuid: 'rd-l1-topological-materials'})
MATCH (c:ResearchDirection) WHERE c.uuid IN ['rd-l2-topological-insulators', 'rd-l2-weyl-semimetals', 'rd-l2-dirac-semimetals', 'rd-l2-axion-insulators']
CREATE (p)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(c);

// Strong Correlation -> Mott, Cuprates, Iron-Pnictides, Nickelates
MATCH (p:ResearchDirection {uuid: 'rd-l1-strong-correlation'})
MATCH (c:ResearchDirection) WHERE c.uuid IN ['rd-l2-mott-insulators', 'rd-l2-cuprates', 'rd-l2-iron-pnictides', 'rd-l2-nickelates']
CREATE (p)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(c);

// Spin Physics -> Rashba, Spin Texture, Magnetic Materials
MATCH (p:ResearchDirection {uuid: 'rd-l1-spin-physics'})
MATCH (c:ResearchDirection) WHERE c.uuid IN ['rd-l2-rashba', 'rd-l2-spin-texture', 'rd-l2-magnetic-materials']
CREATE (p)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(c);

// 2D Materials -> Graphene, TMD
MATCH (p:ResearchDirection {uuid: 'rd-l1-2d-materials'})
MATCH (c:ResearchDirection) WHERE c.uuid IN ['rd-l2-graphene', 'rd-l2-tmd']
CREATE (p)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(c);

// Superconductivity -> Unconventional SC, SC Gap
MATCH (p:ResearchDirection {uuid: 'rd-l1-superconductors'})
MATCH (c:ResearchDirection) WHERE c.uuid IN ['rd-l2-unconventional-sc', 'rd-l2-superconducting-gap']
CREATE (p)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(c);

// --- Level 2 -> Level 3: ARPES hierarchy ---
// Surface Physics -> ARPES (core)
MATCH (p:ResearchDirection {uuid: 'rd-l1-surface-physics'})
MATCH (c:ResearchDirection {uuid: 'rd-l3-arpes'})
CREATE (p)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(c);

// ARPES -> all ARPES sub-techniques
MATCH (p:ResearchDirection {uuid: 'rd-l3-arpes'})
MATCH (c:ResearchDirection)
WHERE c.uuid IN ['rd-l3-nano-arpes', 'rd-l3-tr-arpes', 'rd-l3-spin-arpes', 'rd-l3-resonant-arpes', 'rd-l3-dichroism-arpes', 'rd-l3-in-situ-arpes']
CREATE (p)-[:PARENT_OF {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARP research taxonomy seed', evidenceUrl: ''
}]->(c);

// --- Cross-links: ARPES techniques to studied materials (RELATED_TO) ---
MATCH (arpes:ResearchDirection {uuid: 'rd-l3-arpes'})
MATCH (ti:ResearchDirection {uuid: 'rd-l2-topological-insulators'})
CREATE (arpes)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARPES is the primary tool for studying topological insulator surface states',
    evidenceUrl: ''
}]->(ti);

MATCH (arpes:ResearchDirection {uuid: 'rd-l3-arpes'})
MATCH (cuprates:ResearchDirection {uuid: 'rd-l2-cuprates'})
CREATE (arpes)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARPES critical for measuring d-wave gap in cuprates', evidenceUrl: ''
}]->(cuprates);

MATCH (arpes:ResearchDirection {uuid: 'rd-l3-arpes'})
MATCH (cdw:ResearchDirection {uuid: 'rd-l1-charge-density-wave'})
CREATE (arpes)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'ARPES directly images CDW gap and Fermi surface nesting', evidenceUrl: ''
}]->(cdw);

MATCH (sarpes:ResearchDirection {uuid: 'rd-l3-spin-arpes'})
MATCH (rashba:ResearchDirection {uuid: 'rd-l2-rashba'})
CREATE (sarpes)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'Spin-ARPES directly measures Rashba spin splitting', evidenceUrl: ''
}]->(rashba);

MATCH (trarpes:ResearchDirection {uuid: 'rd-l3-tr-arpes'})
MATCH (usc:ResearchDirection {uuid: 'rd-l2-unconventional-sc'})
CREATE (trarpes)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'trARPES probes ultrafast dynamics of unconventional superconductors', evidenceUrl: ''
}]->(usc);

MATCH (nano:ResearchDirection {uuid: 'rd-l3-nano-arpes'})
MATCH (tmd:ResearchDirection {uuid: 'rd-l2-tmd'})
CREATE (nano)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'Nano-ARPES is essential for measuring band structure of exfoliated TMD flakes', evidenceUrl: ''
}]->(tmd);

// Superconductivity cross-link to Cuprates and Iron-based
MATCH (sc:ResearchDirection {uuid: 'rd-l1-superconductors'})
MATCH (cu:ResearchDirection {uuid: 'rd-l2-cuprates'})
CREATE (sc)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'Cuprates are the prototypical high-Tc superconductors', evidenceUrl: ''
}]->(cu);

MATCH (sc:ResearchDirection {uuid: 'rd-l1-superconductors'})
MATCH (fe:ResearchDirection {uuid: 'rd-l2-iron-pnictides'})
CREATE (sc)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'Iron-based superconductors are a major class of unconventional SC', evidenceUrl: ''
}]->(fe);

MATCH (sc:ResearchDirection {uuid: 'rd-l1-superconductors'})
MATCH (ni:ResearchDirection {uuid: 'rd-l2-nickelates'})
CREATE (sc)-[:RELATED_TO {
    source: 'manual', confidence: 1.0, collectedAt: datetime(), verifiedAt: datetime(),
    evidence: 'Nickelates are a newly discovered superconducting family', evidenceUrl: ''
}]->(ni);

// =============================================================================
// Migration Complete
// =============================================================================
// Verification queries:
//   SHOW CONSTRAINTS;
//   SHOW INDEXES;
//   MATCH (rd:ResearchDirection) RETURN rd.level, count(*) ORDER BY rd.level;
//   MATCH p=(:ResearchDirection {level:0})-[:PARENT_OF*1..3]->(:ResearchDirection) RETURN p;
//   MATCH (rd:ResearchDirection)-[:RELATED_TO]->(other) RETURN rd.name, collect(other.name);
// =============================================================================
