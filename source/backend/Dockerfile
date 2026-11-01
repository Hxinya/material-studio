FROM maven:3.9-eclipse-temurin-21 AS development
WORKDIR /app
COPY settings.xml /root/.m2/settings.xml
COPY pom.xml ./
COPY src ./src
# 缓存 Maven 仓库，源码变动后只重新编译。发布依赖统一从 Maven Central 获取。
RUN --mount=type=cache,target=/root/.m2/repository mvn --batch-mode --no-transfer-progress -DskipTests package \
    && cp -a /root/.m2/repository /opt/maven-repository
ENV MAVEN_ARGS="--no-transfer-progress -Dmaven.repo.local=/opt/maven-repository"
EXPOSE 8080
CMD ["mvn", "--batch-mode", "spring-boot:run"]

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache curl && addgroup -S app && adduser -S app -G app \
    && mkdir -p /data/materials && chown app:app /data/materials
COPY --from=development --chown=app:app /app/target/material-studio-backend-0.1.0.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
