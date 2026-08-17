package com.petpark.world.dto;

import lombok.Data;

/** 牧场收蛋请求：携带动物代码（chicken/duck/cow） */
@Data
public class RanchCollectReq {
    /** 动物代码：chicken / duck / cow */
    private String animalCode;
}
