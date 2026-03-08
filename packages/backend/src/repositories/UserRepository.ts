import { query } from '../config/database';
import { User, PaginatedResult } from './types';

/**
 * User Repository
 * 
 * Handles CRUD operations for users with transaction support
 */
export class UserRepository {
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const users = await query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return users[0] || null;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const users = await query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return users[0] || null;
  }
  /**
   * Find all users with pagination
   */
  async findAll(options?: { limit?: number; offset?: number }): Promise<User[]> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const users = await query<User>(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return users;
  }


  /**
   * Create a new user
   */
  async create(userData: {
    name: string;
    email: string;
    password_hash: string;
    role: User['role'];
    is_active?: boolean;
  }): Promise<User> {
    const users = await query<User>(
      `INSERT INTO users (name, email, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [
        userData.name,
        userData.email,
        userData.password_hash,
        userData.role,
        userData.is_active ?? true,
      ]
    );
    return users[0];
  }

  /**
   * Update user
   */
  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
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

    const users = await query<User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return users[0] || null;
  }

  /**
   * Delete user (soft delete by setting is_active to false)
   */
  async delete(id: string): Promise<boolean> {
    const result = await query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );
    return result.length > 0;
  }

  /**
   * Search users with pagination
   */
  async search(filters: {
    role?: User['role'];
    is_active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<User>> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.role) {
      conditions.push(`role = $${paramIndex}`);
      values.push(filters.role);
      paramIndex++;
    }

    if (filters.is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex}`);
      values.push(filters.is_active);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      values
    );
    const total = parseInt(countResult[0].count);

    // Get paginated results
    const users = await query<User>(
      `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      items: users,
      total,
      page,
      limit,
      hasMore: offset + users.length < total,
    };
  }
}
