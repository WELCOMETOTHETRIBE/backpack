/**
 * Adjudication questions for all 110 NIST SP 800-171 Rev 2 controls.
 *
 * Rules:
 *   - First question is the KEY question. If the user answers "No", status → not_started.
 *   - If all key questions are "Yes" but any other question is "No", status → in_progress.
 *   - If all questions are "Yes", status → implemented.
 *   - All questions are written in plain English for non-technical users ("Brenda" persona).
 *   - No RMF jargon. No acronyms without explanation.
 */

import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

export const CONTROL_ADJUDICATION_QUESTIONS: Record<string, string[]> = {

  // ─── ACCESS CONTROL (AC) ────────────────────────────────────────────────────

  "3.1.1": [
    "Do you have a formal process to manage who can access your company's computers and data?",
    "Do you regularly review and update user accounts, especially when employees leave or change roles?",
    "Do you have a written Access Control Policy that has been approved by management?",
  ],
  "3.1.2": [
    "Do your computer systems automatically enforce the access permissions you've assigned to users?",
    "Do you have a way to ensure users can only access the specific information they are authorized to see?",
  ],
  "3.1.3": [
    "Do you control how information flows between different parts of your network (e.g., between your internal network and the internet)?",
    "Do you use security tools like firewalls to enforce these information flow rules?",
  ],
  "3.1.4": [
    "Do you prevent users from having conflicting duties (e.g., the person who approves payments is not the same person who makes them)?",
    "Have you defined and documented the roles and responsibilities that need to be kept separate?",
  ],
  "3.1.5": [
    "Do you ensure that all users, including IT staff, have only the minimum level of access needed to do their jobs?",
    "Do you have a formal process for granting and reviewing administrative or privileged access?",
  ],
  "3.1.6": [
    "Do you limit what non-privileged users can do on your systems to prevent unauthorized changes?",
  ],
  "3.1.7": [
    "Do you prevent non-privileged users from running programs or scripts that could change system security settings?",
  ],
  "3.1.8": [
    "Do your systems automatically log users out or lock their sessions after a defined period of inactivity?",
  ],
  "3.1.9": [
    "Do you display a warning message to users before they log in, stating that the system is for authorized use only?",
    "Has the content of your login warning banner been reviewed and approved?",
  ],
  "3.1.10": [
    "Do you require users to re-authenticate (log back in) before they can access a system they've been away from for a period of time?",
  ],
  "3.1.11": [
    "Do your systems hide what users are typing when they enter their password (i.e., show dots or asterisks instead of characters)?",
  ],
  "3.1.12": [
    "Do you have a secure, documented process for allowing employees to access company systems from outside the office (remote access)?",
    "Do you require remote access connections to use encryption (e.g., a VPN)?",
  ],
  "3.1.13": [
    "Do you protect your remote access sessions with encryption (e.g., a VPN or encrypted protocol)?",
  ],
  "3.1.14": [
    "Do you route all remote access through specific, managed entry points rather than allowing direct connections to any system?",
  ],
  "3.1.15": [
    "Do you have a documented list of which privileged commands are allowed to be executed over a remote connection?",
  ],
  "3.1.16": [
    "Do you have a formal process for authorizing and securing wireless networks?",
    "Do you protect your wireless networks with strong encryption (e.g., WPA2 or WPA3)?",
  ],
  "3.1.17": [
    "Do you protect your wireless access points with strong encryption?",
  ],
  "3.1.18": [
    "Do you have a policy and process for connecting mobile devices (like phones and tablets) to your network?",
    "Do you require mobile devices to be enrolled in a mobile device management (MDM) system before connecting?",
  ],
  "3.1.19": [
    "Do you encrypt CUI when it is stored on mobile devices like laptops, phones, or tablets?",
  ],
  "3.1.20": [
    "Do you have a process for reviewing and approving any information before it is posted on a publicly accessible company website?",
    "Do you have a list of users who are authorized to post content to public-facing systems?",
  ],
  "3.1.21": [
    "Do you limit who can access CUI on your systems to only those who need it for their job?",
  ],
  "3.1.22": [
    "Do you have a formal, written process for how employees must handle, store, and dispose of CUI?",
  ],

  // ─── AWARENESS AND TRAINING (AT) ────────────────────────────────────────────

  "3.2.1": [
    "Do you provide basic security awareness training to all employees when they are hired and at least once a year after that?",
    "Does your training cover topics like recognizing phishing emails, creating strong passwords, and protecting sensitive information?",
    "Do you keep records of who has completed security awareness training?",
  ],
  "3.2.2": [
    "Do you provide specialized cybersecurity training for employees with specific security roles (like IT staff, managers, or system administrators)?",
    "Do you keep records of who has completed role-based security training?",
  ],
  "3.2.3": [
    "Does your security training include information about how to recognize and report potential insider threats?",
    "Do you keep records of who has completed insider threat awareness training?",
  ],

  // ─── AUDIT AND ACCOUNTABILITY (AU) ──────────────────────────────────────────

  "3.3.1": [
    "Do your systems create and keep logs of user activities, especially for events that could be a security risk?",
    "Have you defined and documented what types of events need to be logged by your systems?",
    "Do you have a policy for how long audit logs must be retained?",
  ],
  "3.3.2": [
    "Do you regularly review system logs for any unusual or suspicious activity?",
    "Do you have a process for investigating and responding to suspicious activity found in logs?",
  ],
  "3.3.3": [
    "Do your system logs include enough information to determine who did what, and when (e.g., user ID, timestamp, action taken)?",
  ],
  "3.3.4": [
    "Do you use an automated system to synchronize the clocks on all your computers and servers to a reliable time source?",
  ],
  "3.3.5": [
    "Do you protect your system logs from being accidentally or intentionally changed or deleted?",
    "Do you limit who has the ability to modify or delete audit logs?",
  ],
  "3.3.6": [
    "Do you limit who has the ability to view and generate reports from system audit logs?",
  ],
  "3.3.7": [
    "Do you have a process to automatically alert the right people when certain important security events happen?",
  ],
  "3.3.8": [
    "Do your systems automatically process audit logs to look for patterns of suspicious activity?",
  ],
  "3.3.9": [
    "Do you have the ability to record and review the specific actions of privileged users (like IT administrators) on your systems?",
  ],

  // ─── CONFIGURATION MANAGEMENT (CM) ──────────────────────────────────────────

  "3.4.1": [
    "Do you have a standard, secure configuration (a 'baseline') for all the computers and servers you use?",
    "Do you have a formal process for managing and documenting these baseline configurations?",
  ],
  "3.4.2": [
    "Do you have a formal change management process for approving and documenting any changes made to your systems?",
    "Do you keep records of all changes made to your systems?",
  ],
  "3.4.3": [
    "Do you regularly check your systems to make sure they still match your approved security configurations?",
  ],
  "3.4.4": [
    "Do you analyze and document the potential security impact of any changes you plan to make to your systems before making them?",
  ],
  "3.4.5": [
    "Do you have a process to ensure that only authorized people can approve and make changes to your systems?",
  ],
  "3.4.6": [
    "Do you configure your systems to provide only the essential functions and services needed for your business (i.e., disable unnecessary features)?",
    "Do you have a list of approved software that is allowed on your company systems?",
  ],
  "3.4.7": [
    "Do you have a list of software that is not allowed on your company systems, and a way to enforce this?",
  ],
  "3.4.8": [
    "Do you use an 'allow list' approach for software, where only explicitly approved applications are permitted to run?",
  ],
  "3.4.9": [
    "Do you control and monitor any software that is installed by users on company systems?",
  ],

  // ─── IDENTIFICATION AND AUTHENTICATION (IA) ──────────────────────────────────

  "3.5.1": [
    "Do you have a formal process for identifying and verifying the identity of all users, processes, or devices that access your systems?",
    "Do you have a written Identification and Authentication Policy?",
  ],
  "3.5.2": [
    "Do you uniquely identify every user account (no shared accounts) and require authentication before granting access?",
  ],
  "3.5.3": [
    "Do you use multifactor authentication (MFA) for all users who access your systems, both locally and remotely?",
    "Do you use MFA for network access to non-privileged accounts?",
    "Do you have a process to enforce MFA across all required access points?",
  ],
  "3.5.4": [
    "Do you have a process to prevent the use of temporary or one-time passwords after their initial use?",
  ],
  "3.5.5": [
    "Do you have a process to prevent the reuse of user account identifiers (like usernames) for a set period of time after an employee leaves?",
  ],
  "3.5.6": [
    "Do you automatically disable user accounts after a defined period of inactivity (e.g., 90 days)?",
  ],
  "3.5.7": [
    "Do you have a formal process for managing passwords and other authenticators, including setting minimum strength requirements?",
    "Do you have a written policy defining minimum password complexity and length?",
  ],
  "3.5.8": [
    "Do you enforce minimum password complexity, length, and history requirements (e.g., no reusing the last 10 passwords)?",
  ],
  "3.5.9": [
    "Do you store all passwords in a hashed or encrypted format so they cannot be read in plain text?",
  ],
  "3.5.10": [
    "Do your systems hide passwords and other authenticators when they are displayed on screen (e.g., showing dots instead of characters)?",
  ],
  "3.5.11": [
    "Do you require users to provide identification and authentication to access CUI, even on publicly accessible systems?",
  ],

  // ─── INCIDENT RESPONSE (IR) ──────────────────────────────────────────────────

  "3.6.1": [
    "Do you have a formal, written plan for how your company will respond to a cybersecurity incident?",
    "Does your incident response plan cover preparation, detection, containment, recovery, and post-incident review?",
    "Have you assigned roles and responsibilities for incident response to specific employees?",
  ],
  "3.6.2": [
    "Do you have a clear, documented process for employees to report potential security incidents?",
    "Do you provide training to employees on how to identify and report security incidents?",
  ],
  "3.6.3": [
    "Do you regularly test your incident response plan (e.g., through tabletop exercises or drills) to make sure it works?",
    "Do you document the results of your incident response tests and use them to improve your plan?",
  ],

  // ─── MAINTENANCE (MA) ────────────────────────────────────────────────────────

  "3.7.1": [
    "Do you have a formal, documented process for performing routine maintenance on your systems?",
    "Do you keep records of all maintenance activities performed on your systems?",
  ],
  "3.7.2": [
    "Do you ensure that all maintenance, whether performed by employees or external vendors, is supervised and follows your security procedures?",
    "Do you have a list of authorized maintenance personnel?",
  ],
  "3.7.3": [
    "Do you have a process to approve and monitor any maintenance activities that are performed off-site?",
  ],
  "3.7.4": [
    "Do you have a process to approve, control, and monitor the use of any maintenance tools, including those used by external vendors?",
    "Do you have a list of approved maintenance tools?",
  ],
  "3.7.5": [
    "Do you have a secure process for allowing remote maintenance of your systems, including using encryption and multi-factor authentication?",
    "Do you keep records of all remote maintenance sessions?",
  ],
  "3.7.6": [
    "Do you have a process to securely wipe (sanitize) any CUI from equipment before it is sent out for maintenance or repair?",
  ],

  // ─── MEDIA PROTECTION (MP) ───────────────────────────────────────────────────

  "3.8.1": [
    "Do you have a formal, written process to protect and control any physical media (like USB drives or external hard drives) that contains CUI?",
  ],
  "3.8.2": [
    "Do you limit who can access physical and digital media that contains CUI to only authorized individuals?",
  ],
  "3.8.3": [
    "Do you have a secure process for sanitizing or destroying media containing CUI before it is disposed of or reused?",
    "Do you keep records of media sanitization and disposal?",
  ],
  "3.8.4": [
    "Do you have a system for marking any physical media that contains CUI so that it is clearly identifiable as sensitive?",
  ],
  "3.8.5": [
    "Do you have a process to control access to, and maintain an inventory of, any media that contains CUI?",
  ],
  "3.8.6": [
    "Do you control and protect CUI stored on digital media, including limiting who can copy or transfer it?",
  ],
  "3.8.7": [
    "Do you control the use of portable storage devices (like USB drives) on your company systems?",
  ],
  "3.8.8": [
    "Do you have a process to securely store and transport any media that contains CUI?",
  ],
  "3.8.9": [
    "Do you protect any CUI stored on media that is not under your direct control (e.g., in a backup facility or with a third party)?",
  ],

  // ─── PERSONNEL SECURITY (PS) ─────────────────────────────────────────────────

  "3.9.1": [
    "Do you have a process to screen individuals (e.g., background checks) before authorizing them to access systems containing CUI?",
    "Do you keep records of personnel screening activities?",
  ],
  "3.9.2": [
    "Do you have a process to immediately disable system access and retrieve company property when an employee leaves the company?",
    "Do you keep records of the actions taken when an employee is terminated or transferred?",
  ],

  // ─── PHYSICAL AND ENVIRONMENTAL PROTECTION (PE) ──────────────────────────────

  "3.10.1": [
    "Do you have a formal process to limit physical access to your company facilities and computer systems to only authorized individuals?",
    "Do you maintain an up-to-date list of who is authorized to access your facility?",
  ],
  "3.10.2": [
    "Do you have a process to monitor and control physical access to your facilities, such as using security cameras or access logs?",
    "Do you review physical access logs on a regular basis?",
  ],
  "3.10.3": [
    "Do you have a process for managing visitors, including escorting them and maintaining visitor logs?",
  ],
  "3.10.4": [
    "Do you maintain a record of who has physical access devices (like keys or access cards) and a process for managing them?",
  ],
  "3.10.5": [
    "Do you have a process to control and manage physical access to your computer systems and the areas where they are located?",
  ],
  "3.10.6": [
    "Do you have measures in place to protect your physical facility from environmental threats (e.g., fire suppression, temperature controls)?",
  ],

  // ─── RISK ASSESSMENT (RA) ────────────────────────────────────────────────────

  "3.11.1": [
    "Do you periodically conduct risk assessments to identify potential security vulnerabilities in your systems and environment?",
    "Do you document the results of your risk assessments?",
    "Do you use the results of your risk assessments to prioritize your security improvements?",
  ],
  "3.11.2": [
    "Do you have a process to promptly identify and fix security vulnerabilities in your systems (e.g., applying software patches)?",
    "Do you keep records of your vulnerability remediation activities?",
  ],
  "3.11.3": [
    "Do you have a process to protect your systems from malicious code (e.g., viruses, ransomware), including keeping anti-malware software up to date?",
  ],

  // ─── SECURITY ASSESSMENT & AUTHORIZATION (CA) ────────────────────────────────

  "3.12.1": [
    "Do you periodically assess the security controls on your systems to ensure they are working effectively?",
    "Do you have a formal, written plan for how you will conduct security assessments?",
    "Do you document the results of your security assessments and share them with management?",
  ],
  "3.12.2": [
    "Do you have a process to track and remediate any security weaknesses found in your systems?",
    "Do you maintain a Plan of Action and Milestones (POA&M) document to manage these remediation efforts?",
  ],
  "3.12.3": [
    "Do you have an ongoing program to monitor the security of your systems on a continuous basis?",
    "Do you have a written plan for your continuous monitoring activities?",
  ],
  "3.12.4": [
    "Do you have a System Security Plan (SSP) that describes your system, its environment, and how you meet all your security requirements?",
    "Do you review and update your SSP at least annually or whenever significant changes occur?",
  ],

  // ─── SYSTEM AND COMMUNICATIONS PROTECTION (SC) ───────────────────────────────

  "3.13.1": [
    "Do you monitor and control all communications at the external boundaries of your systems (e.g., using firewalls)?",
    "Do you have a written policy for protecting your system and communications boundaries?",
  ],
  "3.13.2": [
    "Do you apply security engineering principles when designing and implementing your systems?",
    "Do you have documented security architecture for your systems?",
  ],
  "3.13.3": [
    "Do you separate the user-facing parts of your systems from the administrative or management functions?",
  ],
  "3.13.4": [
    "Do you prevent unauthorized information transfer via shared system resources (e.g., shared memory or disk space)?",
  ],
  "3.13.5": [
    "Do you control and monitor the use of mobile code (e.g., JavaScript, ActiveX) on your systems?",
  ],
  "3.13.6": [
    "Do you use a 'deny all, permit by exception' policy for network traffic at your system boundaries?",
  ],
  "3.13.7": [
    "Do you prevent remote users from simultaneously using a VPN connection to your network and a direct connection to the internet (split tunneling)?",
  ],
  "3.13.8": [
    "Do you have a process to ensure the confidentiality of CUI when it is transmitted over a network (e.g., using encryption)?",
    "Do you use encryption for all transmissions of CUI?",
  ],
  "3.13.9": [
    "Do your systems automatically terminate network connections after a session ends or after a defined period of inactivity?",
  ],
  "3.13.10": [
    "Do you have a formal process for managing and protecting cryptographic keys used to encrypt CUI?",
    "Do you have a written cryptographic key management plan?",
  ],
  "3.13.11": [
    "Do you use FIPS-validated encryption algorithms to protect CUI?",
  ],
  "3.13.12": [
    "Do you protect the confidentiality of CUI when it is stored (data at rest), using encryption or other controls?",
  ],
  "3.13.13": [
    "Do you control and monitor the use of Voice over IP (VoIP) technologies on your network?",
  ],
  "3.13.14": [
    "Do you protect the authenticity of communications sessions to prevent session hijacking?",
  ],
  "3.13.15": [
    "Do you protect the confidentiality of CUI stored in temporary files or caches?",
  ],
  "3.13.16": [
    "Do you protect the confidentiality of CUI during remote access sessions?",
  ],

  // ─── SYSTEM AND INFORMATION INTEGRITY (SI) ───────────────────────────────────

  "3.14.1": [
    "Do you have a formal process to identify, report, and fix security flaws in your systems in a timely manner?",
    "Do you have a written policy for flaw remediation and patch management?",
    "Do you keep records of your flaw remediation activities?",
  ],
  "3.14.2": [
    "Do you have a process to protect your systems from malicious code at all entry and exit points (e.g., email gateways, web proxies)?",
    "Do you keep your malicious code protection software up to date?",
  ],
  "3.14.3": [
    "Do you monitor security alerts and advisories from vendors and government agencies (like CISA) and take appropriate action?",
  ],
  "3.14.4": [
    "Do you update your malicious code protection mechanisms (like anti-virus software) whenever new versions or signatures are available?",
  ],
  "3.14.5": [
    "Do you perform periodic scans of your systems and real-time scans of files from external sources as they are downloaded or executed?",
  ],
  "3.14.6": [
    "Do you monitor your systems to detect attacks and indicators of potential attacks?",
    "Do you have a process for responding to detected attacks or suspicious activity?",
  ],
  "3.14.7": [
    "Do you have a process to identify unauthorized use of your systems (e.g., through log analysis or security monitoring)?",
  ],
};

/**
 * Returns at least one adjudication question for the given control.
 * Uses explicit CONTROL_ADJUDICATION_QUESTIONS when defined; otherwise derives one from the NIST title.
 */
export function getAdjudicationQuestionsForControl(
  controlId: string,
  nistTitle?: string | null
): string[] {
  const explicit = CONTROL_ADJUDICATION_QUESTIONS[controlId];
  if (explicit && explicit.length > 0) return explicit;
  const title = (nistTitle ?? "").trim();
  if (title) return [`Do you have a process for: ${title}?`];
  return ["Do you have the required policies and procedures in place for this control?"];
}

/** Ensures every control in ALL_CONTROL_IDS has at least one question when given a title lookup. */
export function getAllControlIds(): string[] {
  return [...ALL_CONTROL_IDS];
}
