# BESTERRA // INCIDENT COMMAND — クラウド実行用（Render等）
# PHP 8.2（公式イメージは pdo_sqlite / sqlite3 を標準同梱）
FROM php:8.2-cli

WORKDIR /app
COPY . /app

# データ保存先（Renderで永続ディスクを /var/data にマウントすると永続化）
ENV INC_DATA_DIR=/var/data
RUN mkdir -p /var/data && chmod 777 /var/data

# Render等は $PORT を注入する。ビルトインサーバで待受（小規模サービスデスク用途）
CMD ["sh","-c","php -S 0.0.0.0:${PORT:-10000} -t /app"]
