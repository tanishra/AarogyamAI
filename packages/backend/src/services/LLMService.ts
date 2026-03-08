import OpenAI from 'openai';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config';

/**
 * LLM Service for AI interactions
 * Supports OpenAI GPT-4 and AWS Bedrock (Claude)
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class LLMService {
  private openai: OpenAI | null = null;
  private bedrock: BedrockRuntimeClient | null = null;
  private provider: 'openai' | 'bedrock' | 'hybrid';

  constructor() {
    // Read directly from process.env to avoid config caching issues
    const envProvider = process.env.AI_PROVIDER || 'openai';
    this.provider = envProvider as 'openai' | 'bedrock' | 'hybrid';
    
    console.log('[LLMService] Initializing with provider:', this.provider);
    console.log('[LLMService] AI_PROVIDER env:', process.env.AI_PROVIDER);
    console.log('[LLMService] config.ai.provider:', config.ai?.provider);
    
    // Initialize both clients for hybrid mode
    if (this.provider === 'hybrid' || this.provider === 'bedrock') {
      try {
        this.bedrock = new BedrockRuntimeClient({
          region: process.env.AWS_REGION || 'ap-south-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
          },
        });
        console.log('[LLMService] Bedrock client initialized for region:', process.env.AWS_REGION);
      } catch (error) {
        console.error('[LLMService] Failed to initialize Bedrock:', error);
      }
    }
    
    if (this.provider === 'hybrid' || this.provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY || config.ai?.openaiApiKey;
      if (apiKey) {
        this.openai = new OpenAI({ apiKey });
        console.log('[LLMService] OpenAI client initialized');
      }
    }
  }

  /**
   * Generate chat completion with hybrid fallback support
   */
  async chat(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }): Promise<LLMResponse> {
    console.log('[LLMService.chat] Provider:', this.provider);
    console.log('[LLMService.chat] Bedrock client exists:', !!this.bedrock);
    console.log('[LLMService.chat] OpenAI client exists:', !!this.openai);
    
    // Hybrid mode: try Bedrock first, fallback to OpenAI
    if (this.provider === 'hybrid') {
      if (this.bedrock) {
        try {
          console.log('[LLMService.chat] Trying Bedrock first (hybrid mode)');
          return await this.chatBedrock(messages, options);
        } catch (error) {
          console.warn('[LLMService.chat] Bedrock failed, falling back to OpenAI:', error);
          if (this.openai) {
            return await this.chatOpenAI(messages, options);
          }
          throw new Error('Both Bedrock and OpenAI failed. Please check your configuration.');
        }
      } else if (this.openai) {
        console.log('[LLMService.chat] Bedrock not available, using OpenAI');
        return await this.chatOpenAI(messages, options);
      }
      throw new Error('No LLM provider configured. Please set OPENAI_API_KEY or AWS credentials.');
    }
    
    // Bedrock-only mode
    if (this.provider === 'bedrock') {
      return this.chatBedrock(messages, options);
    }

    // OpenAI-only mode
    if (this.provider === 'openai') {
      if (!this.openai) {
        throw new Error('LLM service not configured. Please set OPENAI_API_KEY in environment.');
      }
      return await this.chatOpenAI(messages, options);
    }

    throw new Error('Invalid AI provider configuration');
  }

  /**
   * Generate chat completion using OpenAI
   */
  private async chatOpenAI(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }): Promise<LLMResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not configured. Please set OPENAI_API_KEY in environment.');
    }

    const model = options?.model || 'gpt-4-turbo-preview';
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens || 1000;

    try {
      console.log(`[OpenAI] Invoking model: ${model}`);
      const completion = await this.openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      return {
        content: completion.choices[0]?.message?.content || '',
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate AI response from OpenAI');
    }
  }

  /**
   * Generate chat completion using AWS Bedrock (Claude)
   */
  private async chatBedrock(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }): Promise<LLMResponse> {
    if (!this.bedrock) {
      throw new Error('Bedrock client not configured. Please check AWS credentials.');
    }

    const model = options?.model || config.ai?.model || 'anthropic.claude-3-sonnet-20240229-v1:0';
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens || 1000;

    // Convert messages to Claude format
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Ensure roles alternate between user and assistant
    const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let lastRole: 'user' | 'assistant' | null = null;
    
    for (const msg of conversationMessages) {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      
      // If same role appears twice in a row, merge the messages
      if (lastRole === role && claudeMessages.length > 0) {
        claudeMessages[claudeMessages.length - 1].content += '\n\n' + msg.content;
      } else {
        claudeMessages.push({ role, content: msg.content });
        lastRole = role;
      }
    }
    
    // Claude requires messages to start with user role
    if (claudeMessages.length > 0 && claudeMessages[0].role !== 'user') {
      claudeMessages.unshift({ role: 'user', content: 'Hello' });
    }

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature,
      system: systemMessage?.content || undefined,
      messages: claudeMessages,
    };

    try {
      const command = new InvokeModelCommand({
        modelId: model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      });

      console.log(`[Bedrock] Invoking model: ${model}`);
      const response = await this.bedrock.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return {
        content: responseBody.content[0]?.text || '',
        usage: {
          promptTokens: responseBody.usage?.input_tokens || 0,
          completionTokens: responseBody.usage?.output_tokens || 0,
          totalTokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
        },
      };
    } catch (error: any) {
      console.error('Bedrock API error:', error);
      
      // Provide helpful error messages
      if (error.name === 'AccessDeniedException') {
        throw new Error('AWS Bedrock access denied. Please enable Claude model access in AWS Bedrock console (Model access page).');
      } else if (error.name === 'ResourceNotFoundException') {
        throw new Error(`Model ${model} not found. Please check the model ID in your .env file.`);
      } else if (error.name === 'ValidationException') {
        throw new Error('Invalid request to Bedrock. Please check your message format.');
      }
      
      throw new Error(`Failed to generate AI response from Bedrock: ${error.message}`);
    }
  }

  /**
   * Patient chatbot - conversational nurse persona
   */
  async patientChat(conversationHistory: ChatMessage[], userMessage: string): Promise<string> {
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: `You are a compassionate and professional virtual nurse assistant helping patients describe their medical concerns before their doctor consultation.

Your role:
- Gather information about symptoms, medical history, medications, and allergies
- Ask clarifying questions naturally and empathetically
- Detect emergency symptoms and escalate immediately
- Keep conversation focused and efficient (5-10 minutes max)
- DO NOT provide medical advice, diagnoses, or treatment recommendations
- DO NOT make the patient feel rushed or judged

Emergency symptoms to escalate immediately:
- Chest pain, difficulty breathing, severe bleeding
- Loss of consciousness, severe head injury
- Stroke symptoms (facial drooping, arm weakness, speech difficulty)
- Severe allergic reactions
- Suicidal thoughts or severe mental health crisis

If emergency detected, respond: "EMERGENCY_DETECTED: [symptom]. Please call emergency services immediately or go to the nearest emergency room."

Conversation guidelines:
- Start with empathy and introduce yourself
- Ask about chief complaint first
- Follow up with: duration, severity, what makes it better/worse
- Ask about relevant medical history, medications, allergies
- Keep questions simple and one at a time
- Acknowledge patient's concerns
- End by summarizing and confirming information

Remember: You are gathering information for the doctor, not providing medical advice.`,
    };

    const messages: ChatMessage[] = [
      systemPrompt,
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    const response = await this.chat(messages, {
      temperature: 0.8,
      maxTokens: 300,
    });

    return response.content;
  }

  /**
   * Extract structured data from conversation
   */
  async extractPatientSummary(conversationHistory: ChatMessage[]): Promise<any> {
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: `Extract structured medical information from the patient conversation.

Return a JSON object with:
{
  "chiefComplaint": "main reason for visit",
  "symptoms": ["symptom1", "symptom2"],
  "duration": "how long symptoms present",
  "severity": "mild|moderate|severe",
  "medicalHistory": ["condition1", "condition2"],
  "currentMedications": ["med1", "med2"],
  "allergies": ["allergy1", "allergy2"],
  "socialHistory": {
    "smoking": "yes|no|former",
    "alcohol": "yes|no",
    "occupation": "if mentioned"
  },
  "reviewOfSystems": {
    "constitutional": "notes",
    "cardiovascular": "notes",
    "respiratory": "notes",
    "other": "notes"
  }
}

If information not mentioned, use null or empty array. Be accurate and don't infer information not stated.`,
    };

    const messages: ChatMessage[] = [
      systemPrompt,
      ...conversationHistory,
      { role: 'user', content: 'Extract the structured summary from this conversation.' },
    ];

    const response = await this.chat(messages, {
      temperature: 0.3,
      maxTokens: 800,
    });

    try {
      // Strip markdown code blocks if present
      let content = response.content.trim();
      
      // Remove ```json and ``` markers
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }
      
      return JSON.parse(content.trim());
    } catch (error) {
      console.error('Failed to parse extracted summary:', error);
      console.error('Raw response content:', response.content);
      throw new Error('Failed to extract structured data from conversation');
    }
  }

  /**
   * Generate clinical considerations (differential framing)
   */
  async generateClinicalConsiderations(patientContext: {
    chiefComplaint: string;
    symptoms: string[];
    duration: string;
    severity: string;
    medicalHistory: string[];
    currentMedications: string[];
    allergies: string[];
    vitals?: any;
  }): Promise<any[]> {
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: `You are a clinical decision support system helping physicians consider possible diagnoses.

IMPORTANT: 
- Generate CONSIDERATIONS, not definitive diagnoses
- Frame everything as "possible" or "to consider"
- Provide clinical reasoning for each consideration
- Rank by likelihood and urgency
- Include supporting factors from patient data

Return a JSON array of considerations:
[
  {
    "conditionName": "condition to consider",
    "likelihood": "high|moderate|low",
    "urgency": "urgent|routine|non-urgent",
    "supportingFactors": ["factor1", "factor2"],
    "explanation": "clinical reasoning for this consideration"
  }
]

Provide 5-10 most relevant considerations. Focus on common conditions first, then consider rare but serious conditions.`,
    };

    const contextDescription = `
Patient Context:
- Chief Complaint: ${patientContext.chiefComplaint}
- Symptoms: ${patientContext.symptoms.join(', ')}
- Duration: ${patientContext.duration}
- Severity: ${patientContext.severity}
- Medical History: ${patientContext.medicalHistory.join(', ') || 'None reported'}
- Current Medications: ${patientContext.currentMedications.join(', ') || 'None'}
- Allergies: ${patientContext.allergies.join(', ') || 'None'}
${patientContext.vitals ? `- Vitals: BP ${patientContext.vitals.bloodPressure}, HR ${patientContext.vitals.heartRate}, Temp ${patientContext.vitals.temperature}°F, SpO2 ${patientContext.vitals.oxygenSaturation}%` : ''}

Generate clinical considerations for the physician to review.
`;

    const messages: ChatMessage[] = [
      systemPrompt,
      { role: 'user', content: contextDescription },
    ];

    const response = await this.chat(messages, {
      temperature: 0.5,
      maxTokens: 1500,
    });

    try {
      // Strip markdown code blocks if present (OpenAI sometimes wraps JSON in ```json ... ```)
      let content = response.content.trim();
      if (content.startsWith('```')) {
        // Remove opening ```json or ```
        content = content.replace(/^```(?:json)?\s*\n?/, '');
        // Remove closing ```
        content = content.replace(/\n?```\s*$/, '');
      }
      
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse clinical considerations:', error);
      console.error('Raw response:', response.content);
      throw new Error('Failed to generate clinical considerations');
    }
  }

  /**
   * Assist with clinical reasoning documentation
   */
  async assistClinicalReasoning(patientContext: any, considerations: any[]): Promise<string> {
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: `You are assisting a physician in documenting their clinical reasoning.

Provide a structured template for clinical reasoning documentation that includes:
1. Summary of key findings
2. Differential diagnosis considerations
3. Diagnostic plan recommendations
4. Follow-up considerations

Keep it professional, concise, and physician-friendly. This is a starting point that the physician will edit.`,
    };

    const contextDescription = `
Patient has: ${patientContext.chiefComplaint}
Clinical considerations generated: ${considerations.map(c => c.conditionName).join(', ')}

Generate a clinical reasoning template for the physician to review and edit.
`;

    const messages: ChatMessage[] = [
      systemPrompt,
      { role: 'user', content: contextDescription },
    ];

    const response = await this.chat(messages, {
      temperature: 0.6,
      maxTokens: 800,
    });

    return response.content;
  }
}

export const llmService = new LLMService();
