/** 14 control families for NIST SP 800-171 Rev 2 (CMMC L2). */
export const CONTROL_FAMILIES = [
  { code: "AC", name: "Access Control", controlPrefix: "3.1" },
  { code: "AT", name: "Awareness and Training", controlPrefix: "3.2" },
  { code: "AU", name: "Audit and Accountability", controlPrefix: "3.3" },
  { code: "CM", name: "Configuration Management", controlPrefix: "3.4" },
  { code: "IA", name: "Identification and Authentication", controlPrefix: "3.5" },
  { code: "IR", name: "Incident Response", controlPrefix: "3.6" },
  { code: "MA", name: "Maintenance", controlPrefix: "3.7" },
  { code: "MP", name: "Media Protection", controlPrefix: "3.8" },
  { code: "PS", name: "Personnel Security", controlPrefix: "3.9" },
  { code: "PE", name: "Physical Protection", controlPrefix: "3.10" },
  { code: "RA", name: "Risk Assessment", controlPrefix: "3.11" },
  { code: "CA", name: "Security Assessment", controlPrefix: "3.12" },
  { code: "SC", name: "System and Communications Protection", controlPrefix: "3.13" },
  { code: "SI", name: "System and Information Integrity", controlPrefix: "3.14" },
];
