package com.materialstudio.health;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ApplicationMetadataMapper {
    @Select("SELECT schema_version FROM application_metadata WHERE id = 1")
    String findSchemaVersion();
}
