import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SearchCoverLetterDto {
    @IsString()
    @IsNotEmpty()
    query: string;

    @IsOptional()
    @IsString()
    jobCategory?: string;
}

export class DraftDto {
    @IsOptional()
    @IsString()
    resumeId?: string;
}

export class ReviewDto {
    @IsString()
    @IsNotEmpty()
    content: string;
}
