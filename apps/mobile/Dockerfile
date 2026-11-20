# Môi trường build APK: JDK 21 + Node 22 + Android SDK (platform 36, build-tools 35.0.0). Mã nguồn được mount từ host lúc chạy, không COPY vào image.
FROM eclipse-temurin:21-jdk-jammy
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && apt-get update && apt-get install -y --no-install-recommends unzip curl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
 && curl -fsSL -o /tmp/cl.zip https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip \
 && unzip -q /tmp/cl.zip -d /tmp/cl && mv /tmp/cl/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && rm -rf /tmp/cl /tmp/cl.zip \
 && (yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null) \
 && $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-36" "build-tools;35.0.0" >/dev/null \
 && chmod -R a+rwX $ANDROID_HOME
WORKDIR /app
