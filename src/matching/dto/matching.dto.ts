import {
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

export class MatchDto {
    @IsString()
    @IsNotEmpty()
    text: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    userCareer?: number;

    @IsOptional()
    @IsString()
    employmentType?: string;

    @IsOptional()
    @IsString()
    region?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class MatchConditionsDto {
    @IsOptional()
    @IsString()
    jobCategory?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    skills?: string[];

    @IsOptional()
    @IsString()
    career?: string;

    @IsOptional()
    @IsString()
    employmentType?: string;

    @IsOptional()
    @IsString()
    region?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class MatchByResumeDto {
    @IsOptional()
    @IsInt()
    @Min(0)
    userCareer?: number;

    @IsOptional()
    @IsString()
    employmentType?: string;

    @IsOptional()
    @IsString()
    region?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}
