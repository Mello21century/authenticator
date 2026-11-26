import { Schema, type Types } from 'mongoose';

export interface RefreshTokenDoc { _id: Types.ObjectId; userId: Types.ObjectId; hash: string; family: string; expiresAt: Date; revokedAt?: Date; rotated?: boolean; device?: string }

export const REFRESH_TOKEN = 'RefreshToken';
export const RefreshTokenSchema = new Schema<RefreshTokenDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  hash: { type: String, required: true, unique: true },
  family: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  revokedAt: Date,
  rotated: Boolean,
  device: String,
});
