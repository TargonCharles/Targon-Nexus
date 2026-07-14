// =============================================================================
// Migration: V1.0.0 鈥?Equipment Taxonomy Seed Data
// ARP (Targon Nexus) 鈥?ARPES Research Community
// =============================================================================
// Purpose: Seed standard equipment categories and representative models for
//          the ARPES research community. Equipment nodes serve as both category
//          templates and specific instrument records.
// =============================================================================

// =============================================================================
// CATEGORY 1: ARPES (Angle-Resolved Photoemission Spectroscopy)
// =============================================================================

// --- ARPES Category Root ---
CREATE (:Equipment {
    uuid:         'eq-arpes-root',
    name:         'ARPES System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Angle-Resolved Photoemission Spectroscopy 鈥?directly measures electronic band structure, Fermi surface topology, and single-particle spectral function of crystalline solids.',
    category:     'ARPES',
    keywords:     ['ARPES', 'Angle-Resolved Photoemission', 'Photoemission Spectroscopy', 'Band Structure', 'Fermi Surface', 'Electronic Structure'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Scienta Omicron DA30-L ---
CREATE (:Equipment {
    uuid:         'eq-arpes-scienta-da30l',
    name:         'Scienta Omicron DA30-L',
    brand:        'Scienta Omicron',
    manufacturer: 'Scienta Omicron GmbH',
    model:        'DA30-L',
    generation:   'DA30 Series',
    description:  'High-performance hemispherical electron energy analyzer with wide-angle lens mode. Industry standard for high-resolution ARPES measurements. Angular acceptance up to 30 degrees, energy resolution < 2 meV.',
    category:     'ARPES',
    keywords:     ['ARPES', 'Hemispherical Analyzer', 'DA30', 'Scienta', 'Scienta Omicron', 'Wide Angle'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Scienta Omicron R4000 ---
CREATE (:Equipment {
    uuid:         'eq-arpes-scienta-r4000',
    name:         'Scienta Omicron R4000',
    brand:        'Scienta Omicron',
    manufacturer: 'Scienta Omicron GmbH',
    model:        'R4000',
    generation:   'R-Series',
    description:  'High-resolution hemispherical electron analyzer with 200 mm mean radius. Standard workhorse for synchrotron-based ARPES beamlines worldwide.',
    category:     'ARPES',
    keywords:     ['ARPES', 'R4000', 'Scienta', 'Hemispherical Analyzer', 'Synchrotron'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- SPECS PHOIBOS 150 ---
CREATE (:Equipment {
    uuid:         'eq-arpes-specs-phoibos150',
    name:         'SPECS PHOIBOS 150',
    brand:        'SPECS',
    manufacturer: 'SPECS Surface Nano Analysis GmbH',
    model:        'PHOIBOS 150',
    generation:   'PHOIBOS 100/150 Series',
    description:  'Hemispherical electron energy analyzer with 150 mm mean radius. Widely used for ARPES, XPS, and UPS measurements. Features 2D-CCD detector for parallel angle detection.',
    category:     'ARPES',
    keywords:     ['ARPES', 'PHOIBOS', 'SPECS', 'Hemispherical Analyzer', 'XPS', 'UPS'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Laser ARPES System ---
CREATE (:Equipment {
    uuid:         'eq-arpes-laser',
    name:         'Laser ARPES System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'Laser-ARPES',
    generation:   '6-11 eV',
    description:  'ARPES system using laser-based light sources (typically 6 eV or 11 eV fourth harmonic). Provides ultra-high energy resolution (< 1 meV) and bulk sensitivity complementary to synchrotron ARPES.',
    category:     'ARPES',
    keywords:     ['Laser ARPES', 'Laser', '6 eV', '11 eV', 'High Resolution', 'Bulk Sensitive'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Nano-ARPES System ---
CREATE (:Equipment {
    uuid:         'eq-arpes-nano',
    name:         'Nano-ARPES System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'Nano-ARPES',
    generation:   '',
    description:  'Spatially-resolved ARPES with sub-micron beam spot using Fresnel zone plates or capillary optics. Enables band structure mapping of micro-structured and exfoliated materials.',
    category:     'ARPES',
    keywords:     ['Nano-ARPES', 'NanoARPES', 'Micro-ARPES', 'Spatially Resolved', 'Zone Plate'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Spin-Resolved ARPES (Mott detector) ---
CREATE (:Equipment {
    uuid:         'eq-arpes-spin-mott',
    name:         'Spin-Resolved ARPES with Mott Detector',
    brand:        'Scienta Omicron',
    manufacturer: 'Scienta Omicron GmbH',
    model:        'Mott Spin Detector',
    generation:   '',
    description:  'Combination of hemispherical analyzer with Mott polarimeter for spin-resolved ARPES. Measures spin polarization of photoelectrons using Mott scattering asymmetry.',
    category:     'ARPES',
    keywords:     ['Spin-ARPES', 'SARPES', 'Spin-Resolved', 'Mott Detector', 'Spin Polarization', 'Spin Detector'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Time-Resolved ARPES ---
CREATE (:Equipment {
    uuid:         'eq-arpes-tr',
    name:         'Time-Resolved ARPES System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'trARPES',
    generation:   '',
    description:  'Ultrafast pump-probe ARPES system with femtosecond laser pulses. Captures electron dynamics, transient states, and non-equilibrium phenomena on 50-500 fs timescales.',
    category:     'ARPES',
    keywords:     ['trARPES', 'Time-Resolved ARPES', 'Pump-Probe', 'Femtosecond', 'Ultrafast', 'Dynamics'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 2: MBE (Molecular Beam Epitaxy)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-mbe-root',
    name:         'MBE System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Molecular Beam Epitaxy 鈥?ultra-high vacuum thin film deposition technique for growing high-purity single-crystal films with atomic-layer precision. Essential for creating clean surfaces for ARPES.',
    category:     'MBE',
    keywords:     ['MBE', 'Molecular Beam Epitaxy', 'Thin Film', 'UHV', 'Growth', 'Single Crystal', 'In-Situ'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Scienta Omicron MBE ---
CREATE (:Equipment {
    uuid:         'eq-mbe-scienta-omicron',
    name:         'Scienta Omicron MBE System',
    brand:        'Scienta Omicron',
    manufacturer: 'Scienta Omicron GmbH',
    model:        'PRO-75 MBE',
    generation:   '',
    description:  'Research-grade UHV MBE system with multiple effusion cells, RHEED monitoring, and direct vacuum connection to ARPES analysis chamber.',
    category:     'MBE',
    keywords:     ['MBE', 'Scienta Omicron', 'UHV', 'In-Situ Growth', 'Effusion Cell', 'RHEED'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- SPECS MBE ---
CREATE (:Equipment {
    uuid:         'eq-mbe-specs',
    name:         'SPECS MBE System',
    brand:        'SPECS',
    manufacturer: 'SPECS Surface Nano Analysis GmbH',
    model:        'Octave MBE',
    generation:   '',
    description:  'Integrated MBE system with e-beam evaporators, quartz crystal microbalance, and RHEED for in-situ growth monitoring.',
    category:     'MBE',
    keywords:     ['MBE', 'SPECS', 'UHV', 'Thin Film Growth', 'E-beam Evaporator', 'QCM'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- DCA MBE ---
CREATE (:Equipment {
    uuid:         'eq-mbe-dca',
    name:         'DCA Instruments MBE System',
    brand:        'DCA Instruments',
    manufacturer: 'DCA Instruments Oy',
    model:        'M600',
    generation:   '',
    description:  'Finnish MBE system manufacturer specializing in oxide and nitride thin film growth. Compatible with laser heating and plasma sources.',
    category:     'MBE',
    keywords:     ['MBE', 'DCA Instruments', 'Oxide MBE', 'Nitride MBE', 'Laser Heating'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 3: STM (Scanning Tunneling Microscopy)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-stm-root',
    name:         'STM System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Scanning Tunneling Microscopy 鈥?atomic-resolution surface imaging and spectroscopy using quantum tunneling current. Complementary technique to ARPES for real-space electronic structure.',
    category:     'STM',
    keywords:     ['STM', 'Scanning Tunneling Microscopy', 'STS', 'Atomic Resolution', 'Surface Imaging', 'Tunneling', 'LDOS'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Scienta Omicron LT STM ---
CREATE (:Equipment {
    uuid:         'eq-stm-scienta-lt',
    name:         'Scienta Omicron Low-Temperature STM',
    brand:        'Scienta Omicron',
    manufacturer: 'Scienta Omicron GmbH',
    model:        'LT STM',
    generation:   '',
    description:  'Low-temperature (4.5K or 1.5K) STM system for atomic-resolution imaging and STS in UHV. Includes qPlus AFM sensor capability.',
    category:     'STM',
    keywords:     ['STM', 'STS', 'LT-STM', 'Scienta Omicron', 'qPlus', 'AFM', 'Atomic Resolution'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Unisoku STM ---
CREATE (:Equipment {
    uuid:         'eq-stm-unisoku',
    name:         'Unisoku USM1300 STM',
    brand:        'Unisoku',
    manufacturer: 'Unisoku Co., Ltd.',
    model:        'USM1300',
    generation:   '',
    description:  'Japanese UHV low-temperature STM/AFM system with 3He capability down to 300 mK. High magnetic field options up to 7-11 T.',
    category:     'STM',
    keywords:     ['STM', 'Unisoku', 'Ultra-Low Temperature', '3He', 'High Field', 'Magnetic Field'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- CreaTec STM ---
CREATE (:Equipment {
    uuid:         'eq-stm-createc',
    name:         'CreaTec LT STM',
    brand:        'CreaTec',
    manufacturer: 'CreaTec Fischer & Co. GmbH',
    model:        'LT STM/AFM',
    generation:   '',
    description:  'German low-temperature STM/AFM system operating at 4.6K or 1.2K. Compact design, high stability, excellent for spin-polarized STM and atomic manipulation.',
    category:     'STM',
    keywords:     ['STM', 'CreaTec', 'Low Temperature', 'AFM', 'Spin-Polarized STM', 'Atomic Manipulation'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 4: TEM (Transmission Electron Microscopy)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-tem-root',
    name:         'TEM System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Transmission Electron Microscopy 鈥?high-resolution structural and compositional characterization down to atomic scale. Includes STEM, EELS, and EDS capabilities.',
    category:     'TEM',
    keywords:     ['TEM', 'Transmission Electron Microscopy', 'STEM', 'EELS', 'Electron Diffraction', 'Atomic Imaging'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- JEOL ARM ---
CREATE (:Equipment {
    uuid:         'eq-tem-jeol-arm',
    name:         'JEOL ARM300F TEM',
    brand:        'JEOL',
    manufacturer: 'JEOL Ltd.',
    model:        'ARM300F',
    generation:   'GRAND ARM2',
    description:  'Ultra-high resolution aberration-corrected TEM/STEM operating at 300 kV with sub-Angstrom resolution. Equipped with cold FEG and dual EELS.',
    category:     'TEM',
    keywords:     ['TEM', 'JEOL', 'ARM', 'Aberration Corrected', 'Atomic Resolution', 'Cold FEG', 'EELS'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Thermo Fisher Titan ---
CREATE (:Equipment {
    uuid:         'eq-tem-thermofisher-titan',
    name:         'Thermo Fisher Titan Krios TEM',
    brand:        'Thermo Fisher Scientific',
    manufacturer: 'Thermo Fisher Scientific Inc.',
    model:        'Titan Krios G4',
    generation:   'Krios G4',
    description:  'Cryo-electron microscope operating at 300 kV for structural biology and materials science. Aberration corrected, automated data collection.',
    category:     'TEM',
    keywords:     ['TEM', 'Thermo Fisher', 'Titan', 'Cryo-EM', 'Krios', 'Automated'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 5: SEM (Scanning Electron Microscopy)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-sem-root',
    name:         'SEM System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Scanning Electron Microscopy 鈥?surface morphology and composition imaging with EDS for elemental analysis. Sample screening before ARPES.',
    category:     'SEM',
    keywords:     ['SEM', 'Scanning Electron Microscopy', 'EDS', 'Surface Morphology', 'Elemental Analysis'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Zeiss SEM ---
CREATE (:Equipment {
    uuid:         'eq-sem-zeiss',
    name:         'Zeiss GeminiSEM 500',
    brand:        'Zeiss',
    manufacturer: 'Carl Zeiss Microscopy GmbH',
    model:        'GeminiSEM 500',
    generation:   'Gemini 2',
    description:  'Field emission SEM with Gemini II column, sub-nanometer resolution at low voltage. Suitable for beam-sensitive materials common in ARPES research.',
    category:     'SEM',
    keywords:     ['SEM', 'Zeiss', 'Gemini', 'Field Emission', 'Low Voltage', 'High Resolution', 'EDS'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 6: AFM (Atomic Force Microscopy)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-afm-root',
    name:         'AFM System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Atomic Force Microscopy 鈥?nanoscale surface topography, mechanical, and electrical property mapping. Essential for sample quality verification.',
    category:     'AFM',
    keywords:     ['AFM', 'Atomic Force Microscopy', 'Topography', 'Nanoscale', 'Surface Roughness', 'PFM', 'C-AFM'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Bruker AFM ---
CREATE (:Equipment {
    uuid:         'eq-afm-bruker',
    name:         'Bruker Dimension Icon AFM',
    brand:        'Bruker',
    manufacturer: 'Bruker Corporation',
    model:        'Dimension Icon',
    generation:   'Icon',
    description:  'High-performance AFM with PeakForce Tapping mode, conductive AFM, PFM, and KPFM for comprehensive surface characterization of ARPES samples.',
    category:     'AFM',
    keywords:     ['AFM', 'Bruker', 'Dimension Icon', 'PeakForce', 'PFM', 'KPFM'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 7: XRD (X-Ray Diffraction)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-xrd-root',
    name:         'XRD System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'X-Ray Diffraction 鈥?crystal structure determination, phase identification, and epitaxial quality assessment of samples prior to ARPES measurements.',
    category:     'XRD',
    keywords:     ['XRD', 'X-Ray Diffraction', 'Crystal Structure', 'Phase Identification', 'Laue', 'Rocking Curve'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Rigaku XRD ---
CREATE (:Equipment {
    uuid:         'eq-xrd-rigaku',
    name:         'Rigaku SmartLab XRD',
    brand:        'Rigaku',
    manufacturer: 'Rigaku Corporation',
    model:        'SmartLab',
    generation:   'SmartLab SE',
    description:  'High-resolution X-ray diffractometer with 4-circle goniometer. Supports powder XRD, thin film, reciprocal space mapping, and reflectivity measurements.',
    category:     'XRD',
    keywords:     ['XRD', 'Rigaku', 'SmartLab', 'High Resolution', 'Reciprocal Space Mapping', 'Thin Film', 'Powder'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Bruker D8 ---
CREATE (:Equipment {
    uuid:         'eq-xrd-bruker-d8',
    name:         'Bruker D8 Discover XRD',
    brand:        'Bruker',
    manufacturer: 'Bruker Corporation',
    model:        'D8 Discover',
    generation:   'D8 Series',
    description:  'Versatile XRD platform for powder diffraction, HRXRD, residual stress, and texture analysis. Industry standard in materials science labs.',
    category:     'XRD',
    keywords:     ['XRD', 'Bruker', 'D8', 'HRXRD', 'Powder Diffraction', 'Texture', 'Stress'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 8: PPMS (Physical Property Measurement System)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-ppms-root',
    name:         'PPMS',
    brand:        'Quantum Design',
    manufacturer: 'Quantum Design, Inc.',
    model:        'PPMS DynaCool',
    generation:   'DynaCool',
    description:  'Physical Property Measurement System capable of measuring resistivity, Hall effect, specific heat, magnetic susceptibility, and thermal transport from 1.9K to 400K in fields up to 14T. Essential for bulk characterization.',
    category:     'PPMS',
    keywords:     ['PPMS', 'Quantum Design', 'DynaCool', 'Resistivity', 'Hall Effect', 'Specific Heat', 'Magnetic Susceptibility', 'Transport'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 9: Cryostat
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-cryostat-root',
    name:         'Cryostat System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Cryogenic system for low-temperature measurements down to mK range. Critical for studying low-energy electronic phenomena in correlated and superconducting materials.',
    category:     'Cryostat',
    keywords:     ['Cryostat', 'Low Temperature', 'Liquid Helium', 'Liquid Nitrogen', 'Cryogenics', 'mK Temperature', '3He', 'Dilution Refrigerator'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Oxford Instruments Cryostat ---
CREATE (:Equipment {
    uuid:         'eq-cryostat-oxford',
    name:         'Oxford Instruments TeslatronPT Cryostat',
    brand:        'Oxford Instruments',
    manufacturer: 'Oxford Instruments plc',
    model:        'TeslatronPT',
    generation:   '',
    description:  'Top-loading cryostat system with superconducting magnet (up to 12T). Base temperature < 1.5K with variable temperature insert. Compatible with transport and optical measurements.',
    category:     'Cryostat',
    keywords:     ['Cryostat', 'Oxford Instruments', 'Teslatron', 'Superconducting Magnet', 'Low Temperature', 'Transport'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Bluefors Dilution Refrigerator ---
CREATE (:Equipment {
    uuid:         'eq-cryostat-bluefors',
    name:         'Bluefors LD400 Dilution Refrigerator',
    brand:        'Bluefors',
    manufacturer: 'Bluefors Oy',
    model:        'LD400',
    generation:   '',
    description:  'Dry dilution refrigerator with base temperature < 10 mK. High cooling power for ultra-low temperature ARPES and transport experiments.',
    category:     'Cryostat',
    keywords:     ['Cryostat', 'Dilution Refrigerator', 'Bluefors', 'Ultra-Low Temperature', 'mK', 'Dry System'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 10: Laser (for ARPES light sources)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-laser-root',
    name:         'Laser System',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Ultrafast or continuous-wave laser systems serving as light sources for laser-based ARPES (6 eV, 11 eV). Key parameters: pulse duration, repetition rate, photon flux.',
    category:     'Laser',
    keywords:     ['Laser', 'Light Source', 'Ultrafast', 'Femtosecond', '6 eV', '11 eV', 'Harmonic Generation', 'ARPES'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Coherent Astrella ---
CREATE (:Equipment {
    uuid:         'eq-laser-coherent-astrella',
    name:         'Coherent Astrella Ti:Sapphire Laser',
    brand:        'Coherent',
    manufacturer: 'Coherent, Inc.',
    model:        'Astrella',
    generation:   '',
    description:  'One-box Ti:Sapphire regenerative amplifier delivering < 35 fs pulses at 1 kHz repetition rate with > 6 W average power at 800 nm. Industry standard for trARPES.',
    category:     'Laser',
    keywords:     ['Laser', 'Coherent', 'Ti:Sapphire', 'Femtosecond', 'Regenerative Amplifier', 'trARPES', '800 nm'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Spectra-Physics Spirit ---
CREATE (:Equipment {
    uuid:         'eq-laser-spectraphysics-spirit',
    name:         'Spectra-Physics Spirit One Laser',
    brand:        'Spectra-Physics',
    manufacturer: 'Spectra-Physics (MKS Instruments)',
    model:        'Spirit One 1040-8',
    generation:   '',
    description:  'Industrial-grade Yb-doped femtosecond laser at 1040 nm, > 8 W, < 400 fs. Used with harmonic generation stages for 6 eV/7 eV ARPES light sources.',
    category:     'Laser',
    keywords:     ['Laser', 'Spectra-Physics', 'Yb-doped', 'Femtosecond', '1040 nm', 'High Power', 'Industrial'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- LIGHT CONVERSION PHAROS ---
CREATE (:Equipment {
    uuid:         'eq-laser-lightconversion-pharos',
    name:         'LIGHT CONVERSION PHAROS Laser',
    brand:        'LIGHT CONVERSION',
    manufacturer: 'LIGHT CONVERSION Ltd.',
    model:        'PHAROS',
    generation:   '',
    description:  'Femtosecond Yb:KGW laser with tunable parameters: 100 fs - 20 ps pulse duration, up to 1 MHz repetition rate, up to 20 W average power at 1030 nm. Popular for laser ARPES.',
    category:     'Laser',
    keywords:     ['Laser', 'LIGHT CONVERSION', 'PHAROS', 'Femtosecond', 'Yb:KGW', 'Tunable', 'High Repetition Rate'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// CATEGORY 11: Synchrotron (beamlines)
// =============================================================================

CREATE (:Equipment {
    uuid:         'eq-synchrotron-root',
    name:         'Synchrotron Beamline',
    brand:        'Various',
    manufacturer: 'Multiple',
    model:        'General',
    generation:   '',
    description:  'Synchrotron radiation beamline 鈥?high-brilliance tunable photon source for ARPES, XPS, XAS, RIXS, and PEEM. Covers VUV to hard X-ray range for momentum-dependent spectroscopy.',
    category:     'Synchrotron',
    keywords:     ['Synchrotron', 'Beamline', 'ARPES', 'VUV', 'Soft X-ray', 'Hard X-ray', 'High Brilliance', 'Tunable'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Advanced Light Source (ALS) Beamline 4.0.3 ---
CREATE (:Equipment {
    uuid:         'eq-synchrotron-als-403',
    name:         'ALS Beamline 4.0.3 (MERLIN)',
    brand:        'LBNL',
    manufacturer: 'Lawrence Berkeley National Laboratory',
    model:        'Beamline 4.0.3',
    generation:   'MERLIN',
    description:  'Undulator-based VUV/soft X-ray ARPES beamline at the Advanced Light Source, LBNL. Energy range 20-200 eV, Scienta R4000 analyzer, 6-axis cryomanipulator.',
    category:     'Synchrotron',
    keywords:     ['Synchrotron', 'ALS', 'LBNL', 'Beamline 4.0.3', 'MERLIN', 'VUV', 'Soft X-ray', 'ARPES', 'Undulator'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Diamond Light Source I05 ---
CREATE (:Equipment {
    uuid:         'eq-synchrotron-diamond-i05',
    name:         'Diamond I05 ARPES Beamline',
    brand:        'Diamond',
    manufacturer: 'Diamond Light Source Ltd.',
    model:        'Beamline I05',
    generation:   '',
    description:  'High-resolution ARPES beamline at Diamond Light Source, UK. Two branches: high-resolution branch (8-200 eV) and nano-ARPES branch with Fresnel zone plate focusing.',
    category:     'Synchrotron',
    keywords:     ['Synchrotron', 'Diamond', 'I05', 'ARPES', 'Nano-ARPES', 'High Resolution', 'VUV'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- SSRF (Shanghai Synchrotron) ---
CREATE (:Equipment {
    uuid:         'eq-synchrotron-ssrf',
    name:         'SSRF BL03U ARPES Beamline',
    brand:        'SSRF',
    manufacturer: 'Shanghai Synchrotron Radiation Facility',
    model:        'BL03U',
    generation:   '',
    description:  'Angle-resolved photoemission beamline at Shanghai Synchrotron Radiation Facility. Energy range 7-160 eV, equipped with Scienta DA30-L analyzer.',
    category:     'Synchrotron',
    keywords:     ['Synchrotron', 'SSRF', 'Shanghai', 'BL03U', 'ARPES', 'DA30', 'VUV'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- BESSY II ---
CREATE (:Equipment {
    uuid:         'eq-synchrotron-bessy',
    name:         'BESSY II ARPES Beamline',
    brand:        'HZB',
    manufacturer: 'Helmholtz-Zentrum Berlin',
    model:        'UE112-PGM2a/b',
    generation:   '',
    description:  'High-flux ARPES endstation at BESSY II, Berlin. Includes spin-resolved ARPES (Mott/VLEED), time-resolved ARPES, and 6-axis cryostat capabilities.',
    category:     'Synchrotron',
    keywords:     ['Synchrotron', 'BESSY II', 'HZB', 'ARPES', 'Spin-ARPES', 'trARPES', 'Berlin'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- Soleil CASSIOPEE ---
CREATE (:Equipment {
    uuid:         'eq-synchrotron-soleil',
    name:         'Soleil CASSIOPEE Beamline',
    brand:        'Soleil',
    manufacturer: 'Synchrotron SOLEIL',
    model:        'CASSIOPEE',
    generation:   '',
    description:  'VUV/soft X-ray beamline at SOLEIL, France. Dedicated to high-resolution ARPES with Scienta R4000 analyzer and 6-axis cryomanipulator (5-300K).',
    category:     'Synchrotron',
    keywords:     ['Synchrotron', 'SOLEIL', 'CASSIOPEE', 'ARPES', 'High Resolution', 'France'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// --- HiSOR BL-1 ---
CREATE (:Equipment {
    uuid:         'eq-synchrotron-hisor',
    name:         'HiSOR BL-1 ARPES Beamline',
    brand:        'HiSOR',
    manufacturer: 'Hiroshima Synchrotron Radiation Center',
    model:        'BL-1',
    generation:   '',
    description:  'Linear undulator beamline at HiSOR, Hiroshima. Designed for high-resolution spin-resolved and circular dichroism ARPES measurements.',
    category:     'Synchrotron',
    keywords:     ['Synchrotron', 'HiSOR', 'Hiroshima', 'BL-1', 'Spin-ARPES', 'CD-ARPES'],
    createdAt:    datetime(),
    updatedAt:    datetime()
});

// =============================================================================
// Verification Queries
// =============================================================================

// -- Count equipment by category --
// MATCH (e:Equipment) WHERE e.category IS NOT NULL
// RETURN e.category, count(*) AS count ORDER BY e.category;

// -- List all ARPES systems --
// MATCH (e:Equipment {category: 'ARPES'})
// RETURN e.name, e.brand, e.model ORDER BY e.name;

// -- List all synchrotron beamlines --
// MATCH (e:Equipment {category: 'Synchrotron'})
// RETURN e.name, e.brand, e.description;

// -- Full-text search for a specific analyzer --
// CALL db.index.fulltext.queryNodes('equipment_fulltext', 'Scienta DA30') YIELD node, score
// RETURN node.name, node.category, score;

// -- Find all equipment manufactured by Scienta Omicron --
// MATCH (e:Equipment {manufacturer: 'Scienta Omicron GmbH'})
// RETURN e.name, e.category, e.model ORDER BY e.category, e.name;

// -- Count total equipment records --
// MATCH (e:Equipment) RETURN count(e) AS totalEquipment;
// =============================================================================
