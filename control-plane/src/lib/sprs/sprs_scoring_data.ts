/**
 * SPRS Scoring Data for NIST SP 800-171 Rev 2
 *
 * This data is derived from the DoD Assessment Methodology, Version 1.2.1, Annex A.
 * It maps each of the 110 controls to its point deduction value (1, 3, or 5).
 * A control not implemented results in a deduction of its assigned value from the starting score of 110.
 */

export interface SprsControlScore {
  id: string;
  value: 1 | 3 | 5;
  family: string;
}

export const sprsScoringData: SprsControlScore[] = [
  // Access Control (AC)
  { id: "3.1.1", value: 3, family: "Access Control" },
  { id: "3.1.2", value: 3, family: "Access Control" },
  { id: "3.1.3", value: 5, family: "Access Control" },
  { id: "3.1.4", value: 1, family: "Access Control" },
  { id: "3.1.5", value: 5, family: "Access Control" },
  { id: "3.1.6", value: 3, family: "Access Control" },
  { id: "3.1.7", value: 3, family: "Access Control" },
  { id: "3.1.8", value: 3, family: "Access Control" },
  { id: "3.1.9", value: 1, family: "Access Control" },
  { id: "3.1.10", value: 1, family: "Access Control" },
  { id: "3.1.11", value: 1, family: "Access Control" },
  { id: "3.1.12", value: 5, family: "Access Control" },
  { id: "3.1.13", value: 1, family: "Access Control" },
  { id: "3.1.14", value: 1, family: "Access Control" },
  { id: "3.1.15", value: 1, family: "Access Control" },
  { id: "3.1.16", value: 3, family: "Access Control" },
  { id: "3.1.17", value: 3, family: "Access Control" },
  { id: "3.1.18", value: 5, family: "Access Control" },
  { id: "3.1.19", value: 3, family: "Access Control" },
  { id: "3.1.20", value: 5, family: "Access Control" },
  { id: "3.1.21", value: 5, family: "Access Control" },
  { id: "3.1.22", value: 1, family: "Access Control" },

  // Awareness and Training (AT)
  { id: "3.2.1", value: 3, family: "Awareness and Training" },
  { id: "3.2.2", value: 3, family: "Awareness and Training" },
  { id: "3.2.3", value: 5, family: "Awareness and Training" },

  // Audit and Accountability (AU)
  { id: "3.3.1", value: 5, family: "Audit and Accountability" },
  { id: "3.3.2", value: 3, family: "Audit and Accountability" },
  { id: "3.3.3", value: 1, family: "Audit and Accountability" },
  { id: "3.3.4", value: 1, family: "Audit and Accountability" },
  { id: "3.3.5", value: 5, family: "Audit and Accountability" },
  { id: "3.3.6", value: 1, family: "Audit and Accountability" },
  { id: "3.3.7", value: 1, family: "Audit and Accountability" },
  { id: "3.3.8", value: 3, family: "Audit and Accountability" },
  { id: "3.3.9", value: 1, family: "Audit and Accountability" },

  // Configuration Management (CM)
  { id: "3.4.1", value: 3, family: "Configuration Management" },
  { id: "3.4.2", value: 3, family: "Configuration Management" },
  { id: "3.4.3", value: 1, family: "Configuration Management" },
  { id: "3.4.4", value: 1, family: "Configuration Management" },
  { id: "3.4.5", value: 1, family: "Configuration Management" },
  { id: "3.4.6", value: 5, family: "Configuration Management" },
  { id: "3.4.7", value: 5, family: "Configuration Management" },
  { id: "3.4.8", value: 3, family: "Configuration Management" },
  { id: "3.4.9", value: 3, family: "Configuration Management" },

  // Identification and Authentication (IA)
  { id: "3.5.1", value: 3, family: "Identification and Authentication" },
  { id: "3.5.2", value: 3, family: "Identification and Authentication" },
  { id: "3.5.3", value: 5, family: "Identification and Authentication" },
  { id: "3.5.4", value: 3, family: "Identification and Authentication" },
  { id: "3.5.5", value: 1, family: "Identification and Authentication" },
  { id: "3.5.6", value: 1, family: "Identification and Authentication" },
  { id: "3.5.7", value: 1, family: "Identification and Authentication" },
  { id: "3.5.8", value: 1, family: "Identification and Authentication" },
  { id: "3.5.9", value: 1, family: "Identification and Authentication" },
  { id: "3.5.10", value: 5, family: "Identification and Authentication" },
  { id: "3.5.11", value: 1, family: "Identification and Authentication" },

  // Incident Response (IR)
  { id: "3.6.1", value: 5, family: "Incident Response" },
  { id: "3.6.2", value: 5, family: "Incident Response" },
  { id: "3.6.3", value: 1, family: "Incident Response" },

  // Maintenance (MA)
  { id: "3.7.1", value: 3, family: "Maintenance" },
  { id: "3.7.2", value: 5, family: "Maintenance" },
  { id: "3.7.3", value: 1, family: "Maintenance" },
  { id: "3.7.4", value: 3, family: "Maintenance" },
  { id: "3.7.5", value: 5, family: "Maintenance" },
  { id: "3.7.6", value: 3, family: "Maintenance" },

  // Media Protection (MP)
  { id: "3.8.1", value: 3, family: "Media Protection" },
  { id: "3.8.2", value: 1, family: "Media Protection" },
  { id: "3.8.3", value: 5, family: "Media Protection" },
  { id: "3.8.4", value: 1, family: "Media Protection" },
  { id: "3.8.5", value: 1, family: "Media Protection" },
  { id: "3.8.6", value: 3, family: "Media Protection" },
  { id: "3.8.7", value: 5, family: "Media Protection" },
  { id: "3.8.8", value: 1, family: "Media Protection" },
  { id: "3.8.9", value: 3, family: "Media Protection" },

  // Personnel Security (PS)
  { id: "3.9.1", value: 3, family: "Personnel Security" },
  { id: "3.9.2", value: 3, family: "Personnel Security" },

  // Physical Protection (PE)
  { id: "3.10.1", value: 3, family: "Physical Protection" },
  { id: "3.10.2", value: 3, family: "Physical Protection" },
  { id: "3.10.3", value: 3, family: "Physical Protection" },
  { id: "3.10.4", value: 1, family: "Physical Protection" },
  { id: "3.10.5", value: 5, family: "Physical Protection" },
  { id: "3.10.6", value: 3, family: "Physical Protection" },

  // Risk Assessment (RA)
  { id: "3.11.1", value: 3, family: "Risk Assessment" },
  { id: "3.11.2", value: 5, family: "Risk Assessment" },
  { id: "3.11.3", value: 3, family: "Risk Assessment" },

  // Security Assessment (CA)
  { id: "3.12.1", value: 3, family: "Security Assessment" },
  { id: "3.12.2", value: 3, family: "Security Assessment" },
  { id: "3.12.3", value: 3, family: "Security Assessment" },
  { id: "3.12.4", value: 5, family: "Security Assessment" },

  // System and Communications Protection (SC)
  { id: "3.13.1", value: 3, family: "System and Communications Protection" },
  { id: "3.13.2", value: 5, family: "System and Communications Protection" },
  { id: "3.13.3", value: 1, family: "System and Communications Protection" },
  { id: "3.13.4", value: 1, family: "System and Communications Protection" },
  { id: "3.13.5", value: 5, family: "System and Communications Protection" },
  { id: "3.13.6", value: 5, family: "System and Communications Protection" },
  { id: "3.13.7", value: 1, family: "System and Communications Protection" },
  { id: "3.13.8", value: 3, family: "System and Communications Protection" },
  { id: "3.13.9", value: 1, family: "System and Communications Protection" },
  { id: "3.13.10", value: 1, family: "System and Communications Protection" },
  /**
   * 3.13.11 has a conditional value per the DoD Assessment Methodology:
   * - Deduct 5 points if NO cryptography is employed at all.
   * - Deduct 3 points if cryptography is used but it is mostly not FIPS-validated.
   * The calculator uses 5 as the default (worst case). The UI should prompt the user
   * to select the appropriate sub-condition for accurate scoring.
   */
  { id: "3.13.11", value: 5, family: "System and Communications Protection" },
  { id: "3.13.12", value: 1, family: "System and Communications Protection" },
  { id: "3.13.13", value: 3, family: "System and Communications Protection" },
  { id: "3.13.14", value: 3, family: "System and Communications Protection" },
  { id: "3.13.15", value: 3, family: "System and Communications Protection" },
  { id: "3.13.16", value: 5, family: "System and Communications Protection" },

  // System and Information Integrity (SI)
  { id: "3.14.1", value: 5, family: "System and Information Integrity" },
  { id: "3.14.2", value: 3, family: "System and Information Integrity" },
  { id: "3.14.3", value: 3, family: "System and Information Integrity" },
  { id: "3.14.4", value: 5, family: "System and Information Integrity" },
  { id: "3.14.5", value: 5, family: "System and Information Integrity" },
  { id: "3.14.6", value: 3, family: "System and Information Integrity" },
  { id: "3.14.7", value: 3, family: "System and Information Integrity" },
];
