import { IsOptional, IsString } from 'class-validator';

export class PersonalizedDto {
    @IsOptional()
    @IsString()
    resumeId?: string;
}
