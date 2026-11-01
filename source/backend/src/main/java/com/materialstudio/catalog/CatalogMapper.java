package com.materialstudio.catalog;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CatalogMapper {
    @Select("""
            SELECT c.id, c.name, c.description, COUNT(t.id) AS template_count
            FROM template_categories c LEFT JOIN templates t ON t.category_id = c.id
            GROUP BY c.id, c.name, c.description, c.sort_order ORDER BY c.sort_order, c.id
            """)
    List<CategoryView> findCategories();

    @Select("""
            <script>
            SELECT t.id, t.category_id, c.name AS category_name, t.title, t.description,
                   t.cover_url, t.required_image_count
            FROM templates t JOIN template_categories c ON t.category_id = c.id
            <if test="category != null">WHERE t.category_id = #{category}</if>
            ORDER BY t.sort_order, t.id
            </script>
            """)
    List<TemplateRecord> findTemplates(@Param("category") String category);

    @Select("""
            SELECT t.id, t.category_id, c.name AS category_name, t.title, t.description,
                   t.cover_url, t.required_image_count
            FROM templates t JOIN template_categories c ON t.category_id = c.id WHERE t.id = #{id}
            """)
    TemplateRecord findTemplate(@Param("id") String id);
}
