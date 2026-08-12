package com.petpark.world.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 世界对象响应（chunk 响应 / WS 广播共用）
 */
@Data
public class WorldObjectResp {

    private Long id;
    private String type;
    private int gx;
    private int gz;
    private double rot;
    /** 所有者信息：{uid, nickname} */
    private Map<String, Object> owner;
    private Object extJson;
    private int state;

    public static WorldObjectResp from(Long id, String type, int gx, int gz, BigDecimal rot,
                                       Long ownerUid, String ownerNick, Object extJson, int state) {
        WorldObjectResp r = new WorldObjectResp();
        r.id = id;
        r.type = type;
        r.gx = gx;
        r.gz = gz;
        r.rot = rot == null ? 0.0 : rot.doubleValue();
        r.owner = Map.of("uid", ownerUid, "nickname", ownerNick == null ? "" : ownerNick);
        r.extJson = extJson;
        r.state = state;
        return r;
    }
}
