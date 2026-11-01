package com.materialstudio.material;

import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MaterialMapper {
    // 序列化同账号的草稿修改，版本比较和落盘更新处于同一事务。
    @Select("SELECT id FROM accounts WHERE id = #{accountId} FOR UPDATE")
    Long lockAccount(long accountId);

    @Select("SELECT * FROM material_slots WHERE account_id = #{accountId} AND template_id = #{templateId} ORDER BY slot_index")
    List<MaterialRecord> findSlots(long accountId, String templateId);

    @Insert("""
            INSERT INTO material_slots(account_id, template_id, slot_index) VALUES(#{accountId}, #{templateId}, #{slot})
            ON DUPLICATE KEY UPDATE slot_index = VALUES(slot_index)
            """)
    void ensureSlot(long accountId, String templateId, int slot);

    @Select("SELECT * FROM material_slots WHERE account_id = #{accountId} AND template_id = #{templateId} AND slot_index = #{slot} FOR UPDATE")
    MaterialRecord findSlot(long accountId, String templateId, int slot);

    @Select("SELECT * FROM material_slots WHERE account_id = #{accountId} AND material_id = #{id} FOR SHARE")
    MaterialRecord findOwned(long accountId, String id);

    @Update("""
            UPDATE material_slots SET revision = revision + 1, material_id = #{materialId},
                storage_name = #{storageName}, original_name = #{originalName}, mime_type = #{mimeType},
                size_bytes = #{sizeBytes}, width = #{width}, height = #{height}, updated_at = #{updatedAt}
            WHERE account_id = #{accountId} AND template_id = #{templateId} AND slot_index = #{slotIndex}
            """)
    void replace(MaterialRecord record);
}
