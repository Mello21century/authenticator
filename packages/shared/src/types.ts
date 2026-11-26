export type Algorithm = 'SHA1' | 'SHA256' | 'SHA512';
export type EntryType = 'totp' | 'steam';

export interface EntryInput {
  issuer: string;
  label: string;
  secret: string;
  algorithm: Algorithm;
  digits: number; // 6-8 for totp, 5 for steam
  period: number;
  type: EntryType;
}

export interface Entry {
  id: string;
  issuer: string;
  label: string;
  algorithm: Algorithm;
  digits: number;
  period: number;
  type: EntryType;
  order: number;
  readOnly: boolean;
  sharedWith: string[];
}

export interface CodeItem { entryId: string; code: string; period: number; expiresAt: number }
export interface CodesResponse { serverTime: number; codes: CodeItem[] }
export interface User { id: string; email: string; role: 'owner' | 'member'; mfaEnabled: boolean }
export interface AuthResponse { accessToken: string; refreshToken?: string; user: User }
export interface MfaRequired { mfaRequired: true; mfaToken: string }
export interface Member { id: string; email: string; activated: boolean; createdAt: string }
export interface ExportFile { version: 1; exportedAt: string; entries: (EntryInput & { uri: string })[] }
