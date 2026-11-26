import { Schema, type Types } from 'mongoose';
import type { Sealed } from '../crypto/vault-cipher';

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string | null;
  role: 'owner' | 'member';
  ownerId?: Types.ObjectId;
  mfa?: { secret: Sealed; enabled: boolean; recoveryHashes: string[] };
  createdAt: Date;
}

export const USER = 'User';
export const UserSchema = new Schema<UserDoc>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: null },
  role: { type: String, enum: ['owner', 'member'], required: true },
  ownerId: { type: Schema.Types.ObjectId, index: true },
  mfa: { type: { secret: Object, enabled: Boolean, recoveryHashes: [String] }, default: undefined },
  createdAt: { type: Date, default: () => new Date() },
});
