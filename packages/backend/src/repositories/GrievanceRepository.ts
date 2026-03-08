import { query } from '../config/database';
import { Grievance } from './types';

/**
 * Grievance Repository
 * 
 * Handles grievance tracking and management operations
 */
export class GrievanceRepository {
  /**
   * Find all grievances with optional status filter
   */
  async findAll(status?: Grievance['status']): Promise<Grievance[]> {
    if (status) {
      return query<Grievance>(
        `SELECT * FROM grievances 
         WHERE status = $1 
         ORDER BY submitted_at DESC`,
        [status]
      );
    }
    return query<Grievance>(
      'SELECT * FROM grievances ORDER BY submitted_at DESC'
    );
  }

  /**
   * Find grievance by ID
   */
  async findById(id: string): Promise<Grievance | null> {
    const grievances = await query<Grievance>(
      'SELECT * FROM grievances WHERE id = $1',
      [id]
    );
    return grievances[0] || null;
  }

  /**
   * Find grievances by patient ID
   */
  async findByPatient(patientId: string): Promise<Grievance[]> {
    return query<Grievance>(
      `SELECT * FROM grievances 
       WHERE patient_id = $1 
       ORDER BY submitted_at DESC`,
      [patientId]
    );
  }

  /**
   * Create a new grievance
   */
  async create(data: {
    patient_id: string;
    description: string;
    affected_data?: string;
    resolution_timeline?: Date;
  }): Promise<Grievance> {
    const grievances = await query<Grievance>(
      `INSERT INTO grievances 
       (patient_id, submitted_at, status, description, affected_data, resolution_timeline, created_at, updated_at)
       VALUES ($1, NOW(), 'pending', $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [
        data.patient_id,
        data.description,
        data.affected_data,
        data.resolution_timeline,
      ]
    );
    return grievances[0];
  }

  /**
   * Update grievance status
   */
  async updateStatus(
    id: string,
    status: Grievance['status'],
    dpoNotes?: string,
    resolvedBy?: string
  ): Promise<Grievance | null> {
    const isResolved = status === 'resolved';
    const grievances = await query<Grievance>(
      `UPDATE grievances 
       SET status = $1, 
           dpo_notes = COALESCE($2, dpo_notes),
           resolved_at = ${isResolved ? 'NOW()' : 'resolved_at'},
           resolved_by = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, dpoNotes, resolvedBy, id]
    );
    return grievances[0] || null;
  }

  /**
   * Update grievance with full details
   */
  async update(id: string, updates: Partial<Grievance>): Promise<Grievance | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const grievances = await query<Grievance>(
      `UPDATE grievances SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return grievances[0] || null;
  }

  /**
   * Delete grievance (hard delete)
   */
  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM grievances WHERE id = $1',
      [id]
    );
    return result.length > 0;
  }
}
