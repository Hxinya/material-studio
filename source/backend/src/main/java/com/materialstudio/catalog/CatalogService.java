package com.materialstudio.catalog;

import com.materialstudio.common.ApiException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CatalogService {
    private final CatalogMapper mapper;

    public CatalogService(CatalogMapper mapper) { this.mapper = mapper; }

    public List<CategoryView> categories() { return mapper.findCategories(); }

    public List<TemplateView> templates(String category) {
        String filter = category == null || category.isBlank() ? null : category.trim();
        if (filter != null && !filter.matches("[a-z0-9-]{1,64}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CATEGORY", "分类参数不正确，请重新选择分类");
        }
        return mapper.findTemplates(filter).stream().map(TemplateView::from).toList();
    }

    public TemplateView template(String id) {
        var record = id.matches("[a-z0-9-]{1,64}") ? mapper.findTemplate(id) : null;
        if (record == null) throw new ApiException(HttpStatus.NOT_FOUND, "TEMPLATE_NOT_FOUND", "这个模板不存在或已下架");
        return TemplateView.from(record);
    }
}
