FROM gradle:8.14-jdk21 AS build
WORKDIR /workspace
COPY build.gradle settings.gradle ./
COPY src ./src
RUN gradle bootJar --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
