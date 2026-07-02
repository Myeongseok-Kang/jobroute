import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateResumeDto {
    @IsString()
    @IsNotEmpty()
    content: string;

    @IsOptional()
    @IsString()
    title?: string;
}

export class UpdateResumeDto {
    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @IsString()
    title?: string;
}
