import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetAlertDto {
    @IsBoolean()
    enabled: boolean;

    @IsOptional()
    @IsString()
    resumeId?: string;
}
