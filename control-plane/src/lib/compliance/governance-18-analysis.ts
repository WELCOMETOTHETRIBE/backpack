/**
 * CMMC 18 Governance-Adjudicated Controls — structured data from
 * docs/CMMC_18_Governance_Controls_Clean_Analysis.md for per-control adjudication UI.
 */

export type GovernanceControlAnalysis = {
  controlId: string;
  title: string;
  nistRequirement: string;
  primaryDocuments: { name: string; whatMustAddress: string[] }[];
  evidenceRecordsRequired: string[];
  c3paoVerificationFocus: string[];
};

export const GOVERNANCE_18_CONTROL_IDS: string[] = [
  "3.1.4",
  "3.2.1",
  "3.2.2",
  "3.2.3",
  "3.3.3",
  "3.4.3",
  "3.4.4",
  "3.6.1",
  "3.6.2",
  "3.6.3",
  "3.7.6",
  "3.9.1",
  "3.9.2",
  "3.11.1",
  "3.12.1",
  "3.12.2",
  "3.12.3",
  "3.12.4",
];

export const GOVERNANCE_18_ANALYSIS: Record<string, GovernanceControlAnalysis> = {
  "3.1.4": {
    controlId: "3.1.4",
    title: "Separate Duties",
    nistRequirement: "Separate duties among individuals to prevent malevolent activity.",
    primaryDocuments: [
      {
        name: "Access Control Policy",
        whatMustAddress: [
          "Definition of separation of duties principle",
          "Identification of incompatible duty pairs (e.g., approver cannot implement changes)",
          "Policy requirement that incompatible duties are assigned to different individuals",
          "Monitoring procedures to detect violations",
          "Enforcement mechanisms",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Separation of Duties Matrix (documented role conflicts and assignments)",
      "Access control configuration showing enforcement",
      "Monitoring records showing no violations or documented remediation",
    ],
    c3paoVerificationFocus: [
      "Does the Access Control Policy explicitly define incompatible duty pairs?",
      "Is there a documented Separation of Duties Matrix?",
      "Are access controls configured to prevent conflicts?",
      "Are there monitoring records showing compliance?",
    ],
  },
  "3.2.1": {
    controlId: "3.2.1",
    title: "Security Awareness Training",
    nistRequirement: "Provide security awareness training to all users.",
    primaryDocuments: [
      {
        name: "Awareness and Training Policy",
        whatMustAddress: [
          "Mandatory security awareness training requirement",
          "Training frequency (at least annually)",
          "Training scope (all users)",
          "Training topics (CUI handling, acceptable use, incident reporting)",
          "Approval authority and review procedures",
        ],
      },
      {
        name: "Security Awareness Training Procedure",
        whatMustAddress: [
          "Step-by-step training enrollment and delivery procedures",
          "Training curriculum outline",
          "Completion verification and documentation procedures",
          "Training records retention requirements (minimum 3 years)",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Training completion records for 100% of active users",
      "Training dates within past 12 months for all users",
      "Training attendance/completion documentation",
    ],
    c3paoVerificationFocus: [
      "Does the Awareness and Training Policy mandate annual training for all users?",
      "Does the Security Awareness Training Procedure define the training delivery process?",
      "Do training records exist for all active users?",
      "Are training dates current (within 12 months)?",
    ],
  },
  "3.2.2": {
    controlId: "3.2.2",
    title: "Security Training for Significant Security Responsibilities",
    nistRequirement: "Provide security training to individuals with significant security responsibilities.",
    primaryDocuments: [
      {
        name: "Awareness and Training Policy",
        whatMustAddress: [
          'Definition of "significant security responsibilities" (e.g., system administrators, security officers, incident responders)',
          "Enhanced training requirements for security personnel (beyond general awareness)",
          "Training topics specific to each security role",
          "Training frequency (at least annually)",
          "Training must occur before assuming security responsibilities",
        ],
      },
      {
        name: "Security Awareness Training Procedure",
        whatMustAddress: [
          "Process for identifying individuals with significant security responsibilities",
          "Role-specific training curriculum for each security role",
          "Training delivery procedures",
          "Completion verification for security personnel",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Training completion records for all security personnel",
      "Training dates showing completion before role assignment",
      "Role-specific training curriculum documentation",
    ],
    c3paoVerificationFocus: [
      "Does the Awareness and Training Policy define which roles have significant security responsibilities?",
      "Does the Security Awareness Training Procedure describe role-specific training?",
      "Do training records exist for all security personnel?",
      "Were security personnel trained before assuming their roles?",
    ],
  },
  "3.2.3": {
    controlId: "3.2.3",
    title: "Insider Threat Awareness Training",
    nistRequirement: "Provide insider threat awareness training to all users.",
    primaryDocuments: [
      {
        name: "Awareness and Training Policy",
        whatMustAddress: [
          "Insider threat awareness training is mandatory for all users",
          "Training frequency (at least annually)",
          "Training topics: recognizing insider threat indicators, reporting procedures, non-retaliation policy",
          "Emphasis on non-punitive reporting culture",
        ],
      },
      {
        name: "Security Awareness Training Procedure",
        whatMustAddress: [
          "Insider threat training curriculum outline",
          "Specific insider threat indicators covered (unusual access patterns, policy violations, behavioral changes)",
          "Reporting procedures for suspected insider threats",
          "Non-retaliation policy and multiple reporting channels",
          "Completion verification procedures",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Training completion records for 100% of users",
      "Training curriculum showing insider threat content",
      "Documentation of non-retaliation messaging",
    ],
    c3paoVerificationFocus: [
      "Does the Awareness and Training Policy mandate insider threat training for all users?",
      "Does the Security Awareness Training Procedure include specific insider threat content?",
      "Is non-retaliation messaging documented?",
      "Do training records exist for all users?",
    ],
  },
  "3.3.3": {
    controlId: "3.3.3",
    title: "Review and Update Logged Events",
    nistRequirement: "Review and update logged events for unusual activity.",
    primaryDocuments: [
      {
        name: "Audit and Accountability Policy",
        whatMustAddress: [
          "Audit logs must be reviewed for unusual activity",
          "Review frequency (at least monthly)",
          'Definition of "unusual activity" (e.g., failed login attempts, unauthorized access attempts, privilege escalation)',
          "Escalation procedures for suspicious activity",
          "Retention of review findings and actions",
        ],
      },
      {
        name: "Audit Log Review Procedure",
        whatMustAddress: [
          "Step-by-step audit log review procedure",
          "Tools and methods for log analysis",
          "Search criteria for identifying unusual activity",
          "Documentation template for review findings",
          "Escalation criteria and procedures",
          "Investigation procedures for suspicious activity",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Monthly audit log review records (at least 12 months)",
      "Review findings documentation",
      "Actions taken based on findings",
      "Escalation records if suspicious activity detected",
    ],
    c3paoVerificationFocus: [
      "Does the Audit and Accountability Policy mandate monthly log reviews?",
      "Does the Audit Log Review Procedure define the review procedure?",
      "Do monthly review records exist for past 12 months?",
      "Are findings and actions documented?",
    ],
  },
  "3.4.3": {
    controlId: "3.4.3",
    title: "Change Control",
    nistRequirement: "Approve and control changes to the system.",
    primaryDocuments: [
      {
        name: "Configuration Management Policy",
        whatMustAddress: [
          "All changes must be approved before implementation",
          "Change approval process (request, review, approval, implementation, verification)",
          "Approval authority",
          "Change documentation requirements",
          "Unauthorized changes are prohibited",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Change approval records for all changes (past 6-12 months)",
      "Each change record showing: request, approval, implementation, verification",
      "Documentation of unauthorized changes (if any) and remediation",
    ],
    c3paoVerificationFocus: [
      "Does the Configuration Management Policy require change approval?",
      "Do change approval records exist?",
      "Are all changes approved before implementation?",
      "Are unauthorized changes detected and remediated?",
    ],
  },
  "3.4.4": {
    controlId: "3.4.4",
    title: "Security Impact Analysis",
    nistRequirement: "Perform security impact analysis for changes.",
    primaryDocuments: [
      {
        name: "Configuration Management Policy",
        whatMustAddress: [
          "Security impact analysis is required for all changes",
          "Impact analysis must be documented",
          "High-risk changes require additional review",
        ],
      },
      {
        name: "Configuration Change Procedure",
        whatMustAddress: [
          "Step-by-step security impact analysis procedure",
          "Risk assessment methodology",
          "Documentation template for impact analysis",
          "Approval procedures based on risk level",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Security impact analysis documentation for changes",
      "Risk assessment results",
      "Approval records based on impact analysis",
    ],
    c3paoVerificationFocus: [
      "Does the Configuration Management Policy require security impact analysis?",
      "Does the Configuration Change Procedure define the analysis procedure?",
      "Do impact analysis records exist for changes?",
      "Are high-risk changes identified and escalated?",
    ],
  },
  "3.6.1": {
    controlId: "3.6.1",
    title: "Operational Incident-Handling Capability",
    nistRequirement: "Establish incident response capability.",
    primaryDocuments: [
      {
        name: "Incident Response Policy",
        whatMustAddress: [
          "Incident response capability is established and documented",
          "Incident response team structure and roles",
          "Incident response team members identified",
          "Incident classification and severity levels",
          "Incident response procedures for each phase (detection, analysis, containment, eradication, recovery)",
          "Escalation procedures",
          "Approval authority",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Incident response team roster with members and contact information",
      "Incident classification criteria",
      "Incident response procedures documentation",
      "Escalation procedures",
    ],
    c3paoVerificationFocus: [
      "Is an incident response team formally designated?",
      "Are team members identified and trained?",
      "Are incident classification criteria defined?",
      "Are incident response procedures documented?",
    ],
  },
  "3.6.2": {
    controlId: "3.6.2",
    title: "Track, Document, and Report Incidents",
    nistRequirement: "Track, document, and report incidents.",
    primaryDocuments: [
      {
        name: "Incident Response Policy",
        whatMustAddress: [
          "Incident reporting requirements and procedures",
          "Incident documentation requirements",
          "Incident tracking procedures",
          "Incident reporting procedures (who to notify, when, what information)",
          "Retention of incident records",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Incident records (at least one from past 12 months)",
      "Incident documentation showing: date, description, investigation, actions, resolution",
      "Incident tracking records",
    ],
    c3paoVerificationFocus: [
      "Does the Incident Response Policy require incident documentation?",
      "Do incident records exist?",
      "Are incidents tracked and reported?",
      "Is incident documentation complete?",
    ],
  },
  "3.6.3": {
    controlId: "3.6.3",
    title: "Test Incident Response Capability",
    nistRequirement: "Test incident response capability.",
    primaryDocuments: [
      {
        name: "Incident Response Policy",
        whatMustAddress: [
          "Incident response testing is mandatory",
          "Testing frequency (at least annually)",
          "Testing scope (all incident response procedures)",
        ],
      },
      {
        name: "Incident Response Testing Procedure",
        whatMustAddress: [
          "Testing frequency and schedule",
          "Testing scenarios (detailed descriptions)",
          "Testing procedures (step-by-step)",
          "Success criteria and evaluation procedures",
          "Documentation template",
          "Lessons learned process",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Annual incident response test records",
      "Test scenarios and results",
      "Lessons learned documentation",
      "Improvements implemented",
    ],
    c3paoVerificationFocus: [
      "Does the Incident Response Policy mandate annual testing?",
      "Does the Incident Response Testing Procedure define testing procedures?",
      "Do test records exist for past 12 months?",
      "Are lessons learned documented?",
    ],
  },
  "3.7.6": {
    controlId: "3.7.6",
    title: "Supervise Maintenance Personnel",
    nistRequirement: "Supervise maintenance personnel.",
    primaryDocuments: [
      {
        name: "Maintenance Policy",
        whatMustAddress: [
          "Maintenance personnel supervision is required",
          "Supervision procedures for third-party maintenance",
          "Monitoring procedures for maintenance activities",
          "Documentation requirements",
          "Escalation procedures for unauthorized activities",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Maintenance supervision records",
      "Monitoring logs showing supervision",
      "Documentation of any unauthorized activities and remediation",
    ],
    c3paoVerificationFocus: [
      "Does the Maintenance Policy require supervision of maintenance personnel?",
      "Are supervision procedures documented?",
      "Do supervision records exist?",
      "Are maintenance activities monitored?",
    ],
  },
  "3.9.1": {
    controlId: "3.9.1",
    title: "Screen Individuals Prior to Access",
    nistRequirement: "Screen individuals before authorizing access.",
    primaryDocuments: [
      {
        name: "Personnel Security Policy",
        whatMustAddress: [
          "All individuals must be screened before access authorization",
          "Screening requirements (background check, reference checks, identity verification)",
          "Screening scope and methodology",
          "Screening approval authority",
          "Screening records retention (minimum 3 years)",
        ],
      },
      {
        name: "Personnel Screening Procedure",
        whatMustAddress: [
          "Screening process and procedures",
          "Background check requirements",
          "Reference check procedures",
          "Identity verification procedures",
          "Screening documentation template",
          "Approval procedures",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Screening records for all active users",
      "Screening completion before access authorization",
      "Background check documentation",
    ],
    c3paoVerificationFocus: [
      "Does the Personnel Security Policy require screening?",
      "Does the Personnel Screening Procedure define the screening process?",
      "Do screening records exist for all users?",
      "Was screening completed before access granted?",
    ],
  },
  "3.9.2": {
    controlId: "3.9.2",
    title: "Protect Systems During/After Personnel Actions",
    nistRequirement: "Protect systems during and after personnel actions (termination, role change).",
    primaryDocuments: [
      {
        name: "Personnel Security Policy",
        whatMustAddress: [
          "Access must be terminated upon employee termination or role change",
          "Termination timeframe (within 24 hours)",
          "Termination procedures (access revocation, equipment return, data backup)",
          "Termination approval authority",
          "Termination documentation requirements",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Termination records for all separated employees (past 12 months)",
      "Access revocation records showing 24-hour timeframe",
      "Equipment return documentation",
      "Data backup/preservation documentation",
    ],
    c3paoVerificationFocus: [
      "Does the Personnel Security Policy require timely access termination?",
      "Do termination records exist?",
      "Is access revoked within 24 hours?",
      "Are all systems revoked (network, email, applications, physical)?",
    ],
  },
  "3.11.1": {
    controlId: "3.11.1",
    title: "Periodically Assess Risk",
    nistRequirement: "Conduct risk assessments.",
    primaryDocuments: [
      {
        name: "Risk Assessment Policy",
        whatMustAddress: [
          "Risk assessments are mandatory",
          "Risk assessment frequency (at least annually)",
          "Risk assessment scope (all systems, applications, data)",
          "Risk assessment methodology (NIST SP 800-30 or equivalent)",
          "Risk assessment roles and responsibilities",
          "Risk assessment approval authority",
          "Risk assessment documentation requirements",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Annual risk assessment documentation",
      "Risk assessment methodology",
      "Identified risks with ratings",
      "Mitigation recommendations",
      "Risk assessment approval",
    ],
    c3paoVerificationFocus: [
      "Does the Risk Assessment Policy mandate annual risk assessments?",
      "Do risk assessment records exist?",
      "Is the methodology documented?",
      "Are risks identified and prioritized?",
    ],
  },
  "3.12.1": {
    controlId: "3.12.1",
    title: "Periodically Assess Security Controls",
    nistRequirement: "Periodically assess security controls.",
    primaryDocuments: [
      {
        name: "Security Assessment Policy",
        whatMustAddress: [
          "Security control assessments are mandatory",
          "Assessment frequency (at least annually)",
          "Assessment scope (all 110 controls)",
          "Assessment methodology",
          "Assessment approval authority",
          "Assessment documentation requirements",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Annual security control assessment documentation",
      "Assessment results for each control",
      "Control effectiveness ratings",
      "Findings and recommendations",
      "Assessment approval",
    ],
    c3paoVerificationFocus: [
      "Does the Security Assessment Policy mandate annual assessments?",
      "Do assessment records exist?",
      "Are all 110 controls assessed?",
      "Are findings documented?",
    ],
  },
  "3.12.2": {
    controlId: "3.12.2",
    title: "Develop and Implement Plan of Action & Milestones (POA&M)",
    nistRequirement: "Develop and implement POA&M.",
    primaryDocuments: [
      {
        name: "Security Assessment Policy",
        whatMustAddress: [
          "POA&M development is required for all findings",
          "POA&M content requirements (finding description, remediation plan, timeline, responsible party)",
          "POA&M tracking and monitoring procedures",
          "POA&M approval authority",
          "POA&M documentation and retention requirements",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "POA&M documentation for all findings",
      "Tracking records showing progress",
      "Closure documentation for remediated findings",
    ],
    c3paoVerificationFocus: [
      "Does the Security Assessment Policy require POA&M development?",
      "Do POA&M records exist?",
      "Are findings tracked and remediated?",
      "Is progress documented?",
    ],
  },
  "3.12.3": {
    controlId: "3.12.3",
    title: "Monitor Security Controls",
    nistRequirement: "Monitor security controls.",
    primaryDocuments: [
      {
        name: "Security Assessment Policy",
        whatMustAddress: [
          "Continuous security control monitoring is required",
          "Monitoring frequency (at least quarterly)",
          "Monitoring scope (all controls)",
          "Monitoring procedures and tools",
          "Monitoring results documentation",
          "Escalation procedures for non-compliance",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Quarterly monitoring records (at least 4 per year)",
      "Control status tracking",
      "Monitoring findings and actions",
      "Escalation records",
    ],
    c3paoVerificationFocus: [
      "Does the Security Assessment Policy require quarterly monitoring?",
      "Do monitoring records exist?",
      "Are all controls monitored?",
      "Are findings documented and escalated?",
    ],
  },
  "3.12.4": {
    controlId: "3.12.4",
    title: "Develop/Update System Security Plan",
    nistRequirement: "Develop and update System Security Plan (SSP).",
    primaryDocuments: [
      {
        name: "Security Assessment Policy",
        whatMustAddress: [
          "System Security Plan is mandatory",
          "SSP must be developed before system authorization",
          "SSP must be reviewed and updated annually",
          "SSP must be approved by management/CISO",
          "SSP must be protected and controlled",
        ],
      },
    ],
    evidenceRecordsRequired: [
      "Complete System Security Plan document",
      "SSP covering all 110 controls",
      "SSP approval signatures",
      "Annual review/update records",
    ],
    c3paoVerificationFocus: [
      "Does a complete SSP exist?",
      "Does it cover all 110 controls?",
      "Is it approved by management/CISO?",
      "Has it been reviewed annually?",
    ],
  },
};

export function getGovernanceAnalysis(controlId: string): GovernanceControlAnalysis | undefined {
  return GOVERNANCE_18_ANALYSIS[controlId];
}

export function isGovernance18Control(controlId: string): boolean {
  return GOVERNANCE_18_CONTROL_IDS.includes(controlId);
}
