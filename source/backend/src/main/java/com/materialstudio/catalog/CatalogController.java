package com.materialstudio.catalog;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CatalogController {
    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) { this.catalog = catalog; }

    @GetMapping("/api/template-categories")
    public Items<CategoryView> categories() { return new Items<>(catalog.categories()); }

    @GetMapping("/api/templates")
    public Items<TemplateView> templates(@RequestParam(required = false) String category) {
        return new Items<>(catalog.templates(category));
    }

    @GetMapping("/api/templates/{id}")
    public TemplateView template(@PathVariable String id) { return catalog.template(id); }

    public record Items<T>(List<T> items) {}
}
