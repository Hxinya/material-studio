package com.materialstudio.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.mysql.MySQLContainer;

/** One clean MySQL per test JVM; external Compose database remains an optional fallback. */
public abstract class MySqlIntegrationSupport {
    private static class Database {
        static final MySQLContainer INSTANCE = start();
        static MySQLContainer start() {
            var mysql = new MySQLContainer("mysql:8.4")
                    .withDatabaseName("material_studio_test")
                    .withUsername("material_test").withPassword("local_test_password");
            mysql.start();
            return mysql;
        }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        if (!Boolean.parseBoolean(System.getenv("USE_TESTCONTAINERS"))) return;
        var mysql = Database.INSTANCE;
        properties.add("spring.datasource.url", mysql::getJdbcUrl);
        properties.add("spring.datasource.username", mysql::getUsername);
        properties.add("spring.datasource.password", mysql::getPassword);
    }
}
