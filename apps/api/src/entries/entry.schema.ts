import { Schema, type Types } from 'mongoose';
import type { Sealed } from '../crypto/vault-cipher';
import type { Algorithm } from '../crypto/totp';

export interface EntryDoc {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  issuer: string;
  label: string;
  enc: Sealed;
  fp: string;
  algorithm: Algorithm;
  digits: number;
  period: number;
  type: 'totp' | 'steam';
  sharedWith: Types.ObjectId[];
  order: number;
  createdAt: Date;
}

export const ENTRY = 'Entry';
export const EntrySchema = new Schema<EntryDoc>({
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  issuer: { type: String, default: '' },
  label: { type: String, default: '' },
  enc: { type: Object, required: true },
  fp: { type: String, required: true },
  algorithm: { type: String, enum: ['SHA1', 'SHA256', 'SHA512'], required: true },
  digits: { type: Number, required: true },
  period: { type: Number, required: true },
  type: { type: String, enum: ['totp', 'steam'], required: true },
  sharedWith: { type: [Schema.Types.ObjectId], default: [], index: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: () => new Date() },
});
EntrySchema.index({ ownerId: 1, fp: 1 }, { unique: true });
