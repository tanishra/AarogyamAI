# Design Document: AI-Assisted Clinical Reasoning and Pre-Consultation Support System

This document describes the technical design of a clinical decision-support prototype that structures patient information before consultation and assists physicians with explainable insights. The system supports clinical workflows while ensuring all medical decisions remain under doctor control.

## 1. System Architecture Overview

Layered architecture supporting responsible AI with mandatory doctor-in-the-loop controls and comprehensive audit trails.

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Patient    │  │    Nurse     │  │    Doctor    │          │
│  │  Interface   │  │  Interface   │  │  Interface   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API Gateway & Load Balancer                    │
│                  (Authentication & Rate Limiting)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend Services Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Patient    │  │    Nurse     │  │   Doctor     │          │
│  │   Service    │  │   Service    │  │   Service    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AI Processing Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Adaptive   │  │  Differential│  │   Clinical   │          │
│  │ Questioning  │  │   Framing    │  │  Reasoning   │          │
│  │    Engine    │  │    Engine    │  │    Trace     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Storage Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │    Redis     │  │   Document   │          │
│  │  (Relational)│  │   (Cache)    │  │    Store     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Security and Governance Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     RBAC     │  │  Encryption  │  │  Audit Log   │          │
│  │   Service    │  │   Service    │  │   Service    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Client Layer

- **Patient Interface**: Mobile-friendly questionnaire with progressive disclosure
- **Nurse Interface**: Streamlined vitals entry with validation
- **Doctor Interface**: Unified patient context with AI considerations, inline editing, and approval workflow

### 1.3 Backend Services Layer

- **Patient Service**: Manages questionnaire sessions and adaptive question routing
- **Nurse Service**: Handles vitals entry and validation with timestamps
- **Doctor Service**: Orchestrates patient context and manages approval workflows
- **Context Aggregation Service**: Synthesizes data into clinical categories and highlights critical information

### 1.4 AI Processing Layer

- **Adaptive Questioning Engine**: Generates contextual follow-up questions, prevents question fatigue (15-20 min limit)
- **Differential Framing Engine**: Analyzes patient context to generate clinical considerations (not diagnoses) with reasoning
- **Clinical Reasoning Trace Generator**: Documents physician reasoning with version history


### 1.5 Data Storage Layer

- **PostgreSQL**: Patient data, questionnaire responses, vitals, clinical documentation, audit logs
- **Redis**: Active sessions, authentication tokens, caching, rate limiting
- **Document Store**: Unstructured notes, AI-generated content with metadata
- **Object Storage**: Encrypted backups and model artifacts

### 1.6 Security and Governance Layer

- **RBAC Service**: Role-based permissions with MFA and session management
- **Encryption Service**: TLS 1.3 in transit, AES-256 at rest, key rotation
- **Audit Log Service**: Comprehensive logging with tamper-evident storage

## 2. Core AI Components

### 2.1 Pre-Consultation AI Assistant

**Purpose**: Guide patients through structured information gathering before consultation.

**Key Features**:
- Natural language understanding with context-aware question generation
- Session persistence with 15-20 minute interaction limit
- No diagnostic suggestions to patients
- Clear disclaimers about system limitations

**Technology**: LLM (GPT-4 or equivalent) with intent classification and conversation state management

### 2.2 Adaptive Questioning Module

**Purpose**: Dynamically adjust questioning based on patient responses for clinical relevance.

**Processing Flow**:
1. Parse patient response for key medical details (symptoms, duration, severity)
2. Update conversation context and identify information gaps
3. Generate and score candidate follow-up questions
4. Select highest-scoring question within fatigue constraints

**Safety Mechanisms**: Question count limiting, repetition prevention, inappropriate question filtering, emergency symptom escalation

### 2.3 Differential Framing Engine

**Purpose**: Generate clinical considerations to support physician reasoning without making diagnoses.

**Processing Pipeline**:
1. Extract and normalize clinical features from patient context
2. Query clinical medical knowledge reference for relevant conditions
3. Generate consideration candidates with confidence scores
4. Rank by clinical likelihood and urgency
5. Generate natural language explanations
6. Format output with "for physician review" framing

**Constraints**:
- No definitive diagnostic statements
- All outputs framed as "considerations" or "possibilities"
- Explicit labeling as decision support only
- Physician override capability for all suggestions

### 2.4 Clinical Reasoning Trace Generator

**Purpose**: Document and structure physician clinical reasoning for quality assurance.

**Features**:
- Structured differential diagnosis documentation
- Diagnostic plan capture with reasoning rationale
- Version control for reasoning evolution
- One-click import of AI considerations with inline editing

## 3. Data Flow

### 3.1 Patient Input Flow

1. Patient completes initial questionnaire (demographics, chief complaint)
2. Adaptive Questioning Engine generates contextual follow-up questions
3. Iterative Q&A continues until complete or time limit reached
4. Responses stored encrypted with session marked complete

**Security**: Patient authentication, TLS 1.3 encryption, AES-256 storage, access logging

### 3.2 Nurse Vitals Integration Flow

1. Nurse selects patient and reviews questionnaire summary
2. Enters vital signs in structured form with validation
3. System flags outliers for confirmation
4. Vitals saved with timestamp and nurse attribution
5. Patient marked ready for physician review

### 3.3 Unified Clinical Context Creation Flow

1. Physician selects patient for review
2. Context Aggregation Service retrieves questionnaire responses and vitals
3. Data structured into clinical categories (Chief Complaint, HPI, PMH, Medications, Allergies, ROS, Vitals)
4. Critical information highlighted (allergies, abnormal vitals)
5. Unified context passed to Differential Framing Engine
6. AI generates clinical considerations
7. Complete context + considerations presented to physician

### 3.4 Doctor Review and Approval Flow

1. Physician reviews unified patient context and AI-generated considerations
2. Evaluates each consideration: accept, modify, reject, or add new
3. Documents clinical reasoning and formulates diagnostic plan
4. Explicitly approves final documentation
5. System saves approved content and logs all actions in audit trail

**Approval States**: Draft, Under Review, Approved, Rejected, Modified

## 4. AI Workflow

### 4.1 Input Processing

- **Data Ingestion**: Receive and validate patient responses and nurse vitals, normalize text inputs
- **Information extraction**: Extract key medical details, encode temporal information, quantify severity descriptors
- **Context Enrichment**: Map symptoms to standardized terminologies, identify symptom clusters, flag contradictions

### 4.2 Context Structuring

**Information Hierarchy**:
1. Critical Alerts (allergies, abnormal vitals, red flags)
2. Chief Complaint and History of Present Illness
3. Relevant Past Medical History
4. Current Medications
5. Review of Systems
6. Social History

### 4.3 Reasoning Support

**Differential Framing Process**:
1. Query clinical medical knowledge reference with patient features
2. Generate consideration candidates with confidence scores
3. Rank by clinical likelihood, urgency, and patient demographics
4. Filter to top 5-10 most relevant considerations
5. Generate natural language explanations with supporting factors
6. Apply safety filters to ensure no definitive diagnostic language

### 4.4 Doctor-in-the-Loop Validation

**Presentation**: Display AI considerations with clear labeling, inline explanations, and easy accept/reject/modify actions

**Interaction Tracking**: Log acceptance rates, modifications, new considerations added, rejection reasons, and review time

**Safety Mechanisms**:
- Require explicit approval before finalization
- Prevent auto-execution of clinical actions
- Maintain clear distinction between AI and physician content
- Preserve physician accountability for all decisions
- Enable complete override of AI suggestions

## 5. Security and Privacy

### 5.1 Role-Based Access Control

**Roles & Permissions**:
- **Patient**: Read/write own questionnaire only
- **Nurse**: Read questionnaires, write vitals, view patient queue
- **Doctor**: Read all patient data, read/write clinical reasoning, approve/reject AI content
- **Administrator**: User management, system configuration, audit log access (no clinical data)

### 5.2 Encryption

- **Data in Transit**: TLS 1.3 with certificate pinning and perfect forward secrecy
- **Data at Rest**: AES-256 for database with transparent data encryption
- **Key Management**: HSM or cloud KMS with automatic rotation every 90 days

### 5.3 Audit Logs

- **Logged Events**: User authentication, data access, data modifications, AI invocations, physician actions
- **Log Management**: Centralized logging, tamper-evident storage, real-time anomaly detection
- **Privacy**: No PHI in logs (use IDs only), logs encrypted at rest

## 6. Deployment

### 6.1 Cloud Infrastructure

- **Architecture**: Cloud-deployable scalable service architecture
- **Deployment Strategy**: Blue-green deployments, canary releases, feature flags, automated rollback

### 6.2 Pilot Configuration

- **Scope**: Single department, 50-100 users, 500 consultations/day, 3-month duration
- **Monitoring**: APM, infrastructure metrics, log aggregation, distributed tracing, custom business metrics
- **Disaster Recovery**: Daily automated backups, cross-region replication

## 7. Design Constraints

### 7.1 Synthetic Data for Pilot

- **Data Sources**: Synthetic patient data from clinical simulation tools, de-identified public datasets
- **Limitations**: May not capture full complexity of real presentations, limited rare condition representation
- **Mitigation**: Use clinically validated generators, include diverse demographics, plan for retraining with real data

### 7.2 Decision-Support Only

**Explicit Constraints**:
- AI does not make diagnostic decisions or recommend treatments
- AI does not triage patients or determine urgency independently
- AI does not replace physician judgment

**Design Implications**:
- All outputs framed as "considerations" not "diagnoses"
- Mandatory physician review and approval workflow
- No automated clinical actions
- Physician override capability

**Ethical Safeguards**:
- Transparency about AI capabilities and limitations
- Informed consent for AI-assisted care
- Physician accountability maintained
- Patient right to opt-out

### 7.3 Technical Limitations

- **AI Constraints**: Models trained on historical data, limited handling of rare/emerging conditions, potential bias
- **Integration Constraints**: No EHR integration in pilot, manual data entry, text-based only, English language only
- **Operational Constraints**: Requires stable internet, dependent on cloud availability

---

**Document Version**: 1.0  
**Last Updated**: February 7, 2026  
**Status**: Hackathon Submission  
**Alignment**: Implements requirements.md v1.0
