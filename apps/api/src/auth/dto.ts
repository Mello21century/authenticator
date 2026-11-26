import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CredentialsDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @Length(10, 256) password: string;
}
export class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @Length(1, 256) password: string;
}
export class RefreshDto {
  @IsOptional() @IsString() @MaxLength(200) refreshToken?: string;
}
export class ChangePasswordDto {
  @IsString() @Length(1, 256) current: string;
  @IsString() @Length(10, 256) next: string;
}
export class MfaLoginDto {
  @IsString() @MaxLength(2000) mfaToken: string;
  @IsString() @Length(6, 20) code: string;
}
export class MfaEnableDto {
  @IsString() @Length(6, 6) code: string;
  @IsString() @Length(1, 256) password: string;
}
export class MfaDisableDto {
  @IsString() @Length(1, 256) password: string;
  @IsString() @Length(6, 20) code: string;
}
export class EmailDto {
  @IsEmail() @MaxLength(254) email: string;
}
export class ResetDto {
  @IsString() @Length(20, 200) token: string;
  @IsString() @Length(10, 256) password: string;
}
