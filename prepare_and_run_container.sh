#!/bin/bash
docker ps -q --filter "ancestor=tuberculosis_diagnosis_frontend" | while read container_id
do
    docker stop $container_id
    docker rm $container_id
done
docker build -t tuberculosis_diagnosis_frontend .
docker run -d -p 9110:9110 --network="host" tuberculosis_diagnosis_frontend