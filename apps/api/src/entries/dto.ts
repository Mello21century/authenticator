import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsMongoId, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { normalizeBase32 } from '../crypto/base32';

const normSecret = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  try { return normalizeBase32(value); } catch { return value; }
};
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EntryDto {
  @IsOptional() @IsString() @MaxLength(100) @Transform(trim) issuer: string = '';
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) label: string = '';
  // 16..205 base32 chars = 10..128 bytes
  @IsString() @Transform(normSecret) @Matches(/^[A-Z2-7]+$/, { message: 'secret must be valid base32' }) @Length(16, 205, { message: 'secret must be 10-128 bytes' })
  secret: string;
  @IsOptional() @IsIn(['SHA1', 'SHA256', 'SHA512']) algorithm: 'SHA1' | 'SHA256' | 'SHA512' = 'SHA1';
  @IsOptional() @IsInt() @IsIn([5, 6, 7, 8]) digits: number = 6;
  @IsOptional() @IsInt() @Min(15) @Max(120) period: number = 30;
  @IsOptional() @IsIn(['totp', 'steam']) type: 'totp' | 'steam' = 'totp';
}

export class UpdateEntryDto {
  @IsOptional() @IsString() @MaxLength(100) @Transform(trim) issuer?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) label?: string;
  @IsOptional() @IsString() @Transform(normSecret) @Matches(/^[A-Z2-7]+$/, { message: 'secret must be valid base32' }) @Length(16, 205, { message: 'secret must be 10-128 bytes' })
  secret?: string;
  @IsOptional() @IsIn(['SHA1', 'SHA256', 'SHA512']) algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
  @IsOptional() @IsInt() @IsIn([5, 6, 7, 8]) digits?: number;
  @IsOptional() @IsInt() @Min(15) @Max(120) period?: number;
  @IsOptional() @IsIn(['totp', 'steam']) type?: 'totp' | 'steam';
}

export class OrderDto {
  @IsArray() @ArrayMaxSize(5000) @IsMongoId({ each: true }) ids: string[];
}

export class ShareDto {
  @IsArray() @ArrayMaxSize(500) @IsMongoId({ each: true }) memberIds: string[];
}

export class ImportDto {
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => EntryDto) entries: EntryDto[];
}
