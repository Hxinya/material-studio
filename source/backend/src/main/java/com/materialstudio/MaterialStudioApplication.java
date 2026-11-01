package com.materialstudio;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.boot.context.properties.EnableConfigurationProperties(com.materialstudio.task.TaskSettings.class)
public class MaterialStudioApplication {
    public static void main(String[] args) {
        SpringApplication.run(MaterialStudioApplication.class, args);
    }
}
