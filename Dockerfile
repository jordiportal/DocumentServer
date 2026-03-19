FROM onlyoffice/documentserver:latest

RUN apt-get update && apt-get install -y --no-install-recommends socat && \
    rm -rf /var/lib/apt/lists/*

COPY plugins/{B1AACC00-EC30-4DA4-A400-AAAAAA1110C5} \
     /var/www/onlyoffice/documentserver/sdkjs-plugins/{B1AACC00-EC30-4DA4-A400-AAAAAA1110C5}

COPY plugins/{B1AACC00-EC30-4DA4-A400-AAAAAA1110C6} \
     /var/www/onlyoffice/documentserver/sdkjs-plugins/{B1AACC00-EC30-4DA4-A400-AAAAAA1110C6}

COPY plugins/{B1AACC00-EC30-4DA4-A400-AAAAAA1110C7} \
     /var/www/onlyoffice/documentserver/sdkjs-plugins/{B1AACC00-EC30-4DA4-A400-AAAAAA1110C7}

RUN printf '[program:socat-8088]\ncommand=socat TCP-LISTEN:8088,fork,reuseaddr TCP:localhost:80\nautostart=true\nautorestart=true\nstdout_logfile=/dev/null\nstderr_logfile=/dev/null\n' \
    > /etc/supervisor/conf.d/socat-8088.conf
