package com.materialstudio.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CatalogIntegrationTest extends com.materialstudio.support.MySqlIntegrationSupport {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper json;

    @Test
    void publicCatalogHasThreeOrderedCategoriesAndSixTemplatesWithBothImageCounts() throws Exception {
        var categories = json.readTree(mvc.perform(get("/api/template-categories")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).get("items");
        assertThat(categories).hasSize(3);
        assertThat(categories.get(0).get("id").asText()).isEqualTo("creative");
        for (var category : categories) assertThat(category.get("templateCount").asInt()).isEqualTo(2);
        var items = json.readTree(mvc.perform(get("/api/templates")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).get("items");
        assertThat(items).hasSize(6);
        assertThat(items.findValues("requiredImageCount").stream().map(value -> value.asInt()))
                .contains(1, 2);
    }

    @Test
    void categoryFilterDoesNotLeakOtherCategoriesAndUnknownCategoryIsEmpty() throws Exception {
        var items = json.readTree(mvc.perform(get("/api/templates").param("category", "duo"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("items");
        assertThat(items).hasSize(2);
        for (var item : items) assertThat(item.get("categoryId").asText()).isEqualTo("duo");
        mvc.perform(get("/api/templates").param("category", "not-present"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        mvc.perform(get("/api/templates").param("category", " "))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(6));
    }

    @Test
    void invalidCategoryIsJson400AndCannotTurnIntoAnUnfilteredSqlQuery() throws Exception {
        mvc.perform(get("/api/templates").param("category", "duo' OR '1'='1"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CATEGORY"));
        mvc.perform(get("/api/templates").param("category", "a".repeat(65)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void detailIncludesServerRulesAndUnknownTemplateReturns404() throws Exception {
        mvc.perform(get("/api/templates/travel-duo"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requiredImageCount").value(2))
                .andExpect(jsonPath("$.acceptedMimeTypes[0]").value("image/jpeg"))
                .andExpect(jsonPath("$.acceptedMimeTypes[1]").value("image/png"))
                .andExpect(jsonPath("$.maxFileSizeBytes").value(5242880));
        mvc.perform(get("/api/templates/not-present")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TEMPLATE_NOT_FOUND"));
    }

    @Test
    void catalogReadsCurrentMysqlRowsRatherThanHardcodedControllerData() throws Exception {
        jdbc.update("INSERT INTO template_categories VALUES ('catalog-test', '测试分类', '测试说明', 99)");
        jdbc.update("""
                INSERT INTO templates VALUES ('catalog-test-item', 'catalog-test', '数据库测试模板',
                    '测试说明', '/api/catalog-assets/paper-postcard.svg', 2, 99)
                """);
        mvc.perform(get("/api/templates").param("category", "catalog-test"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value("catalog-test-item"));
        mvc.perform(get("/api/templates/catalog-test-item"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("数据库测试模板"));
    }

    @Test
    void everySeedCoverIsALocalPublicFileServedByJava() throws Exception {
        var items = json.readTree(mvc.perform(get("/api/templates")).andReturn().getResponse().getContentAsString()).get("items");
        for (var item : items) {
            String path = item.get("coverUrl").asText();
            assertThat(path).startsWith("/api/catalog-assets/").endsWith(".svg");
            mvc.perform(get(path)).andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith("image/svg+xml"));
        }
    }
}
