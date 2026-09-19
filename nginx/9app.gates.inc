# Gắn app bên thứ ba dưới path 9app.tech — KHÔNG đặt file này thành *.conf
# (nginx.conf include includes/*.conf). Thêm app: copy khối location, đổi prefix.
#
# 9pick.tech vẫn chạy độc lập. Hub chỉ proxy + viết lại URL gốc thành /9pick/.

location = /9pick {
    return 301 /9pick/;
}

location ^~ /9pick/ {
    proxy_pass http://k77htk:8000/;
    proxy_http_version 1.1;
    proxy_set_header Host 9pick.tech;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Prefix /9pick;
    proxy_set_header Accept-Encoding "";

    proxy_request_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    client_max_body_size 640m;

    proxy_redirect https://9pick.tech/ /9pick/;
    proxy_redirect http://9pick.tech/ /9pick/;
    proxy_redirect / /9pick/;

    proxy_cookie_path / /9pick/;
    proxy_hide_header X-Frame-Options;

    sub_filter_once off;
    sub_filter_types text/html text/css text/javascript application/javascript application/json;
    sub_filter 'https://9pick.tech' '/9pick';
    sub_filter 'http://9pick.tech' '/9pick';
    sub_filter 'https://k77htk.com' '/9pick';
    sub_filter 'http://k77htk.com' '/9pick';
    sub_filter 'href="/' 'href="/9pick/';
    sub_filter "href='/" "href='/9pick/";
    sub_filter 'src="/' 'src="/9pick/';
    sub_filter "src='/" "src='/9pick/";
    sub_filter 'action="/' 'action="/9pick/';
    sub_filter 'content="/' 'content="/9pick/';
    sub_filter "('/" "('/9pick/";
    sub_filter '("/' '("/9pick/';
    sub_filter "|| '/" "|| '/9pick/";
    sub_filter '?tiep=/' '?tiep=/9pick/';
    sub_filter 'url(/' 'url(/9pick/';
    sub_filter '</body>' '<script src="/js/homebar.js"></script></body>';
}

location = /9quy {
    return 301 /9quy/;
}

location ^~ /9quy/ {
    proxy_pass http://9quy:8088/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Prefix /9quy;
    proxy_set_header Accept-Encoding "";

    proxy_request_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    client_max_body_size 20m;

    proxy_redirect http://9quy:8088/ /9quy/;
    proxy_redirect / /9quy/;

    proxy_cookie_path / /9quy/;
    proxy_hide_header X-Frame-Options;

    sub_filter_once off;
    sub_filter_types text/html text/css text/javascript application/javascript application/json;
    sub_filter 'http://9quy:8088' '/9quy';
    sub_filter 'href="/' 'href="/9quy/';
    sub_filter "href='/" "href='/9quy/";
    sub_filter 'src="/' 'src="/9quy/';
    sub_filter "src='/" "src='/9quy/";
    sub_filter 'action="/' 'action="/9quy/';
    sub_filter 'content="/' 'content="/9quy/';
    sub_filter "('/" "('/9quy/";
    sub_filter '("/' '("/9quy/';
    sub_filter "|| '/" "|| '/9quy/";
    sub_filter '?tiep=/' '?tiep=/9quy/';
    sub_filter 'url(/' 'url(/9quy/';
    sub_filter '</body>' '<script src="/js/homebar.js"></script></body>';
}

location = /9fin {
    return 301 /9fin/;
}

location ^~ /9fin/ {
    proxy_pass http://9fin:8080/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Prefix /9fin;
    proxy_set_header Accept-Encoding "";

    proxy_request_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    client_max_body_size 20m;

    proxy_redirect http://9fin:8080/ /9fin/;
    proxy_redirect / /9fin/;

    proxy_cookie_path / /9fin/;
    proxy_hide_header X-Frame-Options;

    sub_filter_once off;
    sub_filter_types text/html text/css text/javascript application/javascript application/json;
    sub_filter 'http://9fin:8080' '/9fin';
    sub_filter 'href="/' 'href="/9fin/';
    sub_filter "href='/" "href='/9fin/";
    sub_filter 'src="/' 'src="/9fin/';
    sub_filter "src='/" "src='/9fin/";
    sub_filter 'action="/' 'action="/9fin/';
    sub_filter 'content="/' 'content="/9fin/';
    sub_filter "('/" "('/9fin/";
    sub_filter '("/' '("/9fin/';
    sub_filter "|| '/" "|| '/9fin/";
    sub_filter '?tiep=/' '?tiep=/9fin/';
    sub_filter 'url(/' 'url(/9fin/';
    sub_filter '</body>' '<script src="/js/homebar.js"></script></body>';
}
